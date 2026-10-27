"""
HEMO-GRID AI - Donor Response Prediction Engine
Blended LinUCB Contextual Multi-Armed Bandit + Heuristic + XGBoost Machine Learning Model.
Context features for LinUCB:
  1. distance
  2. blood group match
  3. days since last donation
  4. past accept rate
  5. hours since last notified
XGBoost provides a robust fallback for cold-start donors, while LinUCB personalizes
and adapts recommendations with online feedback and dynamic fatigue penalties.
"""

from __future__ import annotations

import json
import logging
import os
import random
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

try:
    import numpy as np
except ImportError:
    np = None

logger = logging.getLogger(__name__)

# Feature column order for XGBoost ML training and inference
FEATURE_NAMES = [
    "distance_km",
    "urgency_level",
    "historical_donations",
    "days_since_last_donation",
    "compatibility_score",
    "hour_of_day",
    "traffic_factor",
    "donor_age",
]

# Context features for LinUCB bandit
BANDIT_CONTEXT_FEATURES = [
    "distance",
    "blood_group_match",
    "days_since_last_donation",
    "past_accept_rate",
    "hours_since_last_notified",
]


@dataclass
class DonorFeatureInput:
    donor_id: str
    name: str
    blood_group: str
    distance_km: float
    urgency_level: str  # 'low', 'medium', 'high', 'critical'
    historical_donations: int = 3
    days_since_last_donation: int = 120
    compatibility_score: float = 1.0
    hour_of_day: int = 14
    traffic_factor: float = 1.1
    donor_age: int = 28
    past_accept_rate: Optional[float] = None
    hours_since_last_notified: Optional[float] = None


class SyntheticDatasetGenerator:
    """
    Generates synthetic medical emergency response datasets modeled after
    real-world Chennai blood bank donor dispatch patterns.
    """

    @staticmethod
    def generate(num_samples: int = 3000, seed: int = 42) -> Tuple[np.ndarray, np.ndarray]:
        if np is None:
            raise RuntimeError("NumPy is required for synthetic dataset generation")
        np.random.seed(seed)
        random.seed(seed)

        # 1. Feature generation
        distance_km = np.random.exponential(scale=4.5, size=num_samples).clip(0.4, 25.0)
        urgency_level = np.random.choice([0, 1, 2, 3], size=num_samples, p=[0.25, 0.35, 0.25, 0.15])
        historical_donations = np.random.poisson(lam=4.0, size=num_samples).clip(0, 20)
        days_since_last_donation = np.random.uniform(90, 400, size=num_samples)
        compatibility_score = np.random.choice([1.0, 0.8, 0.5], size=num_samples, p=[0.6, 0.25, 0.15])
        hour_of_day = np.random.randint(0, 24, size=num_samples)
        traffic_factor = np.random.uniform(1.0, 1.6, size=num_samples)
        donor_age = np.random.normal(loc=31.0, scale=8.0, size=num_samples).clip(18, 60)

        X = np.column_stack([
            distance_km,
            urgency_level,
            historical_donations,
            days_since_last_donation,
            compatibility_score,
            hour_of_day,
            traffic_factor,
            donor_age,
        ])

        # 2. Realistic ground-truth probability calculation
        logits = (
            1.8
            - 0.22 * distance_km
            + 0.55 * urgency_level
            + 0.18 * historical_donations
            + 0.003 * (days_since_last_donation - 90)
            + 0.80 * (compatibility_score - 0.5)
            - 0.85 * ((hour_of_day < 6) | (hour_of_day > 22)).astype(float)
            - 0.60 * (traffic_factor - 1.0)
            - 0.015 * np.abs(donor_age - 30)
        )

        probabilities = 1.0 / (1.0 + np.exp(-logits))
        noise = np.random.normal(0, 0.08, size=num_samples)
        y = ((probabilities + noise) >= 0.50).astype(int)

        return X, y


class HeuristicDonorScorer:
    """
    Domain-specific rule-based clinical heuristic for ranking blood donor response.
    Acts as baseline and safety guardrail for ML predictions.
    """

    @staticmethod
    def score(features: DonorFeatureInput) -> float:
        # Distance component: 1.0 at 0km, dropping to 0 at 15km
        dist_score = max(0.0, 1.0 - (features.distance_km / 15.0))

        # Urgency multiplier
        urgency_map = {"low": 0.5, "medium": 0.7, "high": 0.9, "critical": 1.0}
        urgency_score = urgency_map.get(features.urgency_level.lower(), 0.7)

        # Loyalty component based on previous donations
        loyalty_score = min(1.0, features.historical_donations / 8.0)

        # Elapsed recovery days (ideal > 120 days)
        recovery_score = min(1.0, features.days_since_last_donation / 180.0)

        # Daytime convenience
        time_score = 0.4 if (features.hour_of_day < 6 or features.hour_of_day > 22) else 1.0

        # Weighted heuristic formula
        composite = (
            0.35 * dist_score
            + 0.25 * urgency_score
            + 0.15 * loyalty_score
            + 0.10 * recovery_score
            + 0.10 * features.compatibility_score
            + 0.05 * time_score
        )
        return float(max(0.05, min(0.98, composite)))


def compute_fatigue_penalty(hours_since_notified: Optional[float]) -> float:
    """
    Applies a notification fatigue penalty to donors notified recently.
    Prevents alert exhaustion and donor churn:
      - Within 2 hours: ~0.35 - 0.40 penalty
      - Within 12 hours: ~0.26 penalty
      - Within 24 hours: ~0.14 penalty
      - Over 48 hours / never: 0.0 penalty
    """
    if hours_since_notified is None:
        return 0.0
    h = max(0.0, float(hours_since_notified))
    if h >= 48.0:
        return 0.0
    decay = (1.0 - (h / 48.0)) ** 1.5
    return round(float(0.40 * decay), 4)


@dataclass
class DonorArm:
    """Per-donor LinUCB bandit arm parameters and interaction history."""
    donor_id: str
    A: Any  # np.ndarray of shape (d, d)
    b: Any  # np.ndarray of shape (d,)
    feedback_count: int = 0
    accepted_count: int = 0
    declined_count: int = 0
    last_notified_timestamp: Optional[str] = None
    last_feedback_timestamp: Optional[str] = None
    last_context: Optional[Any] = None

    def get_accept_rate(self) -> float:
        total = self.accepted_count + self.declined_count
        if total == 0:
            return 0.5
        # Laplace smoothed acceptance rate
        return float(round((self.accepted_count + 1.0) / (total + 2.0), 4))

    def get_hours_since_notified(self) -> float:
        if not self.last_notified_timestamp:
            return 720.0  # 30 days default = no fatigue
        try:
            t = datetime.fromisoformat(self.last_notified_timestamp)
            now = datetime.now(timezone.utc)
            if t.tzinfo is None:
                t = t.replace(tzinfo=timezone.utc)
            diff = (now - t).total_seconds() / 3600.0
            return max(0.0, float(diff))
        except Exception:
            return 720.0


class LinUCBDonorBandit:
    """
    LinUCB (Linear Upper Confidence Bound) Contextual Bandit for ranking donors.
    Implemented purely using NumPy (no external bandit libraries).

    Context Features (dimension d=5):
      1. distance (km, normalized to proximity)
      2. blood group match (compatibility score 0.0 - 1.0)
      3. days since last donation (recovery time normalized)
      4. past accept rate (historical acceptance rate 0.0 - 1.0)
      5. hours since last notified (restedness score 0.0 - 1.0)
    """

    def __init__(
        self,
        d: int = 5,
        alpha: float = 0.5,
        regularization_lambda: float = 1.0,
        state_file: Optional[Path] = None,
    ):
        self.d = d
        self.alpha = alpha
        self.reg_lambda = regularization_lambda
        self.state_file = state_file or Path(
            os.environ.get(
                "LINUCB_STATE_PATH",
                str(Path(__file__).resolve().parent / "linucb_bandit_state.json"),
            )
        )
        self.donor_arms: Dict[str, DonorArm] = {}
        self.total_feedback_count: int = 0
        if np is not None:
            self.global_A = self.reg_lambda * np.eye(self.d, dtype=np.float64)
            self.global_b = np.zeros(self.d, dtype=np.float64)
        else:
            self.global_A = None
            self.global_b = None
        self.load_state()

    def get_or_create_arm(self, donor_id: str) -> DonorArm:
        if donor_id not in self.donor_arms:
            arm_A = self.reg_lambda * np.eye(self.d, dtype=np.float64) if np is not None else None
            arm_b = np.zeros(self.d, dtype=np.float64) if np is not None else None
            self.donor_arms[donor_id] = DonorArm(
                donor_id=donor_id,
                A=arm_A,
                b=arm_b,
            )
        return self.donor_arms[donor_id]

    def is_cold_start(self, donor_id: str) -> bool:
        """A donor is cold-start if they have no feedback observations in the bandit."""
        arm = self.donor_arms.get(donor_id)
        return arm is None or arm.feedback_count == 0

    def extract_context(
        self,
        donor: DonorFeatureInput,
    ) -> Tuple[Optional[Any], Dict[str, float]]:
        """
        Extracts the 5 context features and normalizes them for LinUCB.
        Returns:
            Tuple of (numpy context vector x of shape (5,), raw context dictionary)
        """
        dist_km = max(0.0, float(donor.distance_km))
        blood_match = float(np.clip(donor.compatibility_score, 0.0, 1.0)) if np else float(donor.compatibility_score)
        days_since = max(0.0, float(donor.days_since_last_donation))

        # 4. Past acceptance rate
        arm = self.donor_arms.get(donor.donor_id)
        if donor.past_accept_rate is not None:
            past_rate = float(np.clip(donor.past_accept_rate, 0.0, 1.0)) if np else float(donor.past_accept_rate)
        elif arm is not None and arm.feedback_count > 0:
            past_rate = arm.get_accept_rate()
        else:
            # Baseline prior based on historical donation frequency
            past_rate = float(np.clip(0.35 + min(0.50, donor.historical_donations * 0.08), 0.1, 0.9)) if np else 0.5

        # 5. Hours since last notified
        if donor.hours_since_last_notified is not None:
            hours_since = max(0.0, float(donor.hours_since_last_notified))
        elif arm is not None and arm.last_notified_timestamp is not None:
            hours_since = arm.get_hours_since_notified()
        else:
            hours_since = 720.0  # 30 days ago default (no fatigue)

        # Feature normalization into [0, 1] scale for LinUCB matrix stability:
        # Proximity: 1.0 at 0km, dropping towards 0 at 25km
        f_dist = float(max(0.0, 1.0 - (dist_km / 25.0)))
        f_match = blood_match
        # Days recovery: 1.0 at >=120 days
        f_days = float(min(1.0, days_since / 120.0))
        f_rate = past_rate
        # Restedness: 1.0 at >=48 hours
        f_hours = float(min(1.0, hours_since / 48.0))

        if np is not None:
            x = np.array([f_dist, f_match, f_days, f_rate, f_hours], dtype=np.float64)
        else:
            x = None

        raw_context = {
            "distance": round(dist_km, 2),
            "blood_group_match": round(blood_match, 2),
            "days_since_last_donation": round(days_since, 1),
            "past_accept_rate": round(past_rate, 3),
            "hours_since_last_notified": round(hours_since, 1),
        }
        return x, raw_context

    def compute_ucb_score(self, donor_id: str, x: Any) -> float:
        """
        Computes the Upper Confidence Bound score for donor arm given context x.
        LinUCB formula: score = x^T theta + alpha * sqrt(x^T A^-1 x)
        """
        if np is None or x is None:
            return 0.5

        arm = self.get_or_create_arm(donor_id)
        A_arm = arm.A
        b_arm = arm.b

        try:
            # Solve theta = A^-1 b via linear solver (pure NumPy)
            theta = np.linalg.solve(A_arm, b_arm)
            mu = float(np.dot(x, theta))

            # Variance exploration bonus
            inv_A_x = np.linalg.solve(A_arm, x)
            var = float(np.dot(x, inv_A_x))
            sigma = self.alpha * np.sqrt(max(0.0, var))

            return float(mu + sigma)
        except np.linalg.LinAlgError:
            return 0.5

    def record_feedback(
        self,
        donor_id: str,
        accepted: bool,
        context: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        Updates the LinUCB bandit with feedback from a donor interaction
        and persists the updated model state to disk.
        """
        donor_id = str(donor_id).strip()
        reward = 1.0 if accepted else 0.0
        now_iso = datetime.now(timezone.utc).isoformat()

        arm = self.get_or_create_arm(donor_id)

        # Context vector x (d=5)
        if context is not None and np is not None:
            if isinstance(context, np.ndarray):
                x = context.astype(np.float64).ravel()[:self.d]
            elif isinstance(context, dict):
                dummy = DonorFeatureInput(
                    donor_id=donor_id,
                    name="Feedback",
                    blood_group="O+",
                    distance_km=float(context.get("distance", 5.0)),
                    urgency_level="high",
                    days_since_last_donation=int(context.get("days_since_last_donation", 120)),
                    compatibility_score=float(context.get("blood_group_match", 1.0)),
                    past_accept_rate=float(context.get("past_accept_rate", 0.5)),
                    hours_since_last_notified=float(context.get("hours_since_last_notified", 72.0)),
                )
                x, _ = self.extract_context(dummy)
            else:
                x = np.array(context, dtype=np.float64).ravel()[:self.d]
        elif arm.last_context is not None:
            x = arm.last_context
        elif np is not None:
            x = np.array([0.8, 1.0, 1.0, arm.get_accept_rate(), 1.0], dtype=np.float64)
        else:
            x = None

        if np is not None and x is not None:
            if len(x) < self.d:
                x = np.pad(x, (0, self.d - len(x)), constant_values=1.0)

            # Update arm parameters:
            # A_a <- A_a + x * x^T
            # b_a <- b_a + r * x
            arm.A += np.outer(x, x)
            arm.b += reward * x

            # Update global shared model
            self.global_A += np.outer(x, x)
            self.global_b += reward * x

        arm.feedback_count += 1
        if accepted:
            arm.accepted_count += 1
        else:
            arm.declined_count += 1
        arm.last_feedback_timestamp = now_iso
        arm.last_notified_timestamp = now_iso
        if x is not None:
            arm.last_context = x

        self.total_feedback_count += 1

        # Persist model state to disk
        save_ok = self.save_state()

        return {
            "status": "SUCCESS",
            "donor_id": donor_id,
            "accepted": accepted,
            "feedback_count": arm.feedback_count,
            "accepted_count": arm.accepted_count,
            "declined_count": arm.declined_count,
            "past_accept_rate": arm.get_accept_rate(),
            "is_cold_start": False,
            "model_saved": save_ok,
            "state_file": str(self.state_file),
        }

    def record_notification(self, donor_id: str, context: Optional[Any] = None) -> None:
        """Records notification timestamp for fatigue penalty tracking."""
        arm = self.get_or_create_arm(donor_id)
        arm.last_notified_timestamp = datetime.now(timezone.utc).isoformat()
        if context is not None:
            arm.last_context = context
        self.save_state()

    def save_state(self) -> bool:
        """Serializes LinUCB state to JSON file on disk."""
        if np is None or not self.state_file:
            return False
        try:
            self.state_file.parent.mkdir(parents=True, exist_ok=True)
            data = {
                "version": "1.0",
                "model_type": "LinUCB Contextual Bandit",
                "d": self.d,
                "alpha": self.alpha,
                "reg_lambda": self.reg_lambda,
                "total_feedback_count": self.total_feedback_count,
                "global_A": self.global_A.tolist(),
                "global_b": self.global_b.tolist(),
                "donor_arms": {
                    d_id: {
                        "feedback_count": arm.feedback_count,
                        "accepted_count": arm.accepted_count,
                        "declined_count": arm.declined_count,
                        "last_notified_timestamp": arm.last_notified_timestamp,
                        "last_feedback_timestamp": arm.last_feedback_timestamp,
                        "A": arm.A.tolist(),
                        "b": arm.b.tolist(),
                        "last_context": arm.last_context.tolist() if arm.last_context is not None else None,
                    }
                    for d_id, arm in self.donor_arms.items()
                },
                "saved_at": datetime.now(timezone.utc).isoformat(),
            }
            temp_file = self.state_file.with_suffix(".tmp")
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            temp_file.replace(self.state_file)
            return True
        except Exception as exc:
            logger.error("Failed to save LinUCB state to disk: %s", exc)
            return False

    def load_state(self) -> bool:
        """Rehydrates LinUCB state from JSON file on disk."""
        if np is None or not self.state_file or not self.state_file.exists():
            return False
        try:
            with open(self.state_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.d = data.get("d", self.d)
            self.alpha = data.get("alpha", self.alpha)
            self.reg_lambda = data.get("reg_lambda", self.reg_lambda)
            self.total_feedback_count = data.get("total_feedback_count", 0)
            if "global_A" in data and "global_b" in data:
                self.global_A = np.array(data["global_A"], dtype=np.float64)
                self.global_b = np.array(data["global_b"], dtype=np.float64)

            arms_data = data.get("donor_arms", {})
            for d_id, arm_dict in arms_data.items():
                A_arr = np.array(arm_dict["A"], dtype=np.float64)
                b_arr = np.array(arm_dict["b"], dtype=np.float64)
                last_ctx = (
                    np.array(arm_dict["last_context"], dtype=np.float64)
                    if arm_dict.get("last_context") is not None
                    else None
                )
                self.donor_arms[d_id] = DonorArm(
                    donor_id=d_id,
                    A=A_arr,
                    b=b_arr,
                    feedback_count=arm_dict.get("feedback_count", 0),
                    accepted_count=arm_dict.get("accepted_count", 0),
                    declined_count=arm_dict.get("declined_count", 0),
                    last_notified_timestamp=arm_dict.get("last_notified_timestamp"),
                    last_feedback_timestamp=arm_dict.get("last_feedback_timestamp"),
                    last_context=last_ctx,
                )
            logger.info("Loaded LinUCB state with %d donor arms from disk.", len(self.donor_arms))
            return True
        except Exception as exc:
            logger.warning("Failed to load LinUCB state from disk: %s", exc)
            return False

    def get_metrics(self) -> Dict[str, Any]:
        """Summary metrics for the LinUCB bandit."""
        return {
            "model_type": "LinUCB Contextual Bandit",
            "feature_dimension": self.d,
            "context_features": BANDIT_CONTEXT_FEATURES,
            "alpha": self.alpha,
            "regularization_lambda": self.reg_lambda,
            "active_donor_arms": len(self.donor_arms),
            "total_feedback_count": self.total_feedback_count,
            "state_file": str(self.state_file),
        }


class XGBoostDonorPredictor:
    """
    Trains and executes XGBoost classifier for donor acceptance predictions,
    blending results with the clinical heuristic model and LinUCB contextual bandit.
    XGBoost acts as the reliable fallback for cold-start donors.
    """

    def __init__(self):
        self.model = None
        self.is_trained = False
        self.feature_importances: Dict[str, float] = {}
        self.metrics: Dict[str, Any] = {}
        self.bandit = LinUCBDonorBandit()
        self._initialize_or_train()

    def _initialize_or_train(self):
        if np is None:
            self.is_trained = False
            return
        try:
            import xgboost as xgb

            logger.info("Initializing XGBoost donor response model on synthetic dataset...")
            X, y = SyntheticDatasetGenerator.generate(num_samples=2500)

            # Split into train/validation
            split_idx = int(0.8 * len(X))
            X_train, X_val = X[:split_idx], X[split_idx:]
            y_train, y_val = y[:split_idx], y[split_idx:]

            self.model = xgb.XGBClassifier(
                n_estimators=80,
                max_depth=4,
                learning_rate=0.08,
                subsample=0.85,
                colsample_bytree=0.85,
                eval_metric="logloss",
                random_state=42,
            )

            self.model.fit(X_train, y_train)
            self.is_trained = True

            # Calculate validation performance
            y_pred = self.model.predict(X_val)
            accuracy = float(np.mean(y_pred == y_val))

            # Feature importances
            raw_importances = self.model.feature_importances_
            self.feature_importances = {
                name: round(float(imp), 4)
                for name, imp in zip(FEATURE_NAMES, raw_importances)
            }

            self.metrics = {
                "training_samples": len(X_train),
                "validation_samples": len(X_val),
                "validation_accuracy": round(accuracy, 4),
                "model_type": "XGBoost Gradient Boosted Trees",
                "features_count": len(FEATURE_NAMES),
                "feature_importances": self.feature_importances,
                "bandit": self.bandit.get_metrics(),
            }
            logger.info("XGBoost donor model trained successfully. Validation accuracy: %.2f%%", accuracy * 100)

        except Exception as e:
            logger.warning("XGBoost training encountered fallback mode: %s", e)
            self.is_trained = False
            self.metrics = {
                "status": "Heuristic Mode Active",
                "reason": str(e),
                "bandit": self.bandit.get_metrics(),
            }

    def predict(self, donor: DonorFeatureInput) -> Dict[str, Any]:
        """
        Predicts donor emergency response probability using blended XGBoost + Heuristic
        for cold-start donors, and LinUCB contextual bandit for donors with feedback history.
        Applies a fatigue penalty for donors notified recently.
        """
        # 1. Extract bandit context and check cold-start status
        x, context_dict = self.bandit.extract_context(donor)
        is_cold_start = self.bandit.is_cold_start(donor.donor_id)
        hours_since_notified = context_dict["hours_since_last_notified"]

        # Cache context in arm for subsequent feedback updates
        if not is_cold_start and donor.donor_id in self.bandit.donor_arms:
            self.bandit.donor_arms[donor.donor_id].last_context = x

        # 2. Compute baseline heuristic score
        heuristic_prob = HeuristicDonorScorer.score(donor)

        # 3. Compute XGBoost ML prediction (existing model)
        xgb_prob = heuristic_prob
        if np is not None and self.is_trained and self.model is not None:
            urgency_int = {"low": 0, "medium": 1, "high": 2, "critical": 3}.get(
                donor.urgency_level.lower(), 1
            )
            feature_vector = np.array([[
                donor.distance_km,
                urgency_int,
                donor.historical_donations,
                donor.days_since_last_donation,
                donor.compatibility_score,
                donor.hour_of_day,
                donor.traffic_factor,
                donor.donor_age,
            ]])
            try:
                probs = self.model.predict_proba(feature_vector)[0]
                xgb_prob = float(probs[1])
            except Exception as exc:
                logger.debug("XGBoost inference fallback: %s", exc)
                xgb_prob = heuristic_prob

        # 4. Base prediction: LinUCB for warm donors, XGBoost for cold-start donors
        linucb_score = None
        if is_cold_start:
            # Cold-start fallback: 70% XGBoost ML + 30% Clinical Heuristic
            base_prob = float(0.70 * xgb_prob + 0.30 * heuristic_prob)
            blend_ratio = "70% XGBoost + 30% Heuristic"
        else:
            # Warm donor: LinUCB contextual bandit
            linucb_score = self.bandit.compute_ucb_score(donor.donor_id, x)
            # Calibrate LinUCB score into bounded response probability [0.05, 0.98]
            bandit_prob = float(np.clip(linucb_score, 0.05, 0.98)) if np else 0.5
            # Blended with domain safety heuristic (80% LinUCB + 20% Heuristic)
            base_prob = float(0.80 * bandit_prob + 0.20 * heuristic_prob)
            blend_ratio = "80% LinUCB + 20% Heuristic"

        # 5. Apply fatigue penalty to donors notified recently
        fatigue_penalty = compute_fatigue_penalty(hours_since_notified)
        final_prob = max(0.05, min(0.98, base_prob - fatigue_penalty))

        # ETA calculation: estimated driving time + 5 min preparation buffer
        travel_eta_mins = round((donor.distance_km / 35.0) * 60.0 + 5.0, 1)

        # Recommendation category
        if final_prob >= 0.75:
            rec = "PRIMARY_RESPONDER"
            color = "#10b981"
        elif final_prob >= 0.50:
            rec = "STANDBY_BACKUP"
            color = "#f59e0b"
        else:
            rec = "LOW_PROBABILITY"
            color = "#ef4444"

        # Key explanatory factors
        factors = []
        if donor.distance_km <= 3.0:
            factors.append(f"Close proximity ({donor.distance_km:.1f} km)")
        elif donor.distance_km > 10.0:
            factors.append(f"High transit distance ({donor.distance_km:.1f} km)")

        if donor.historical_donations >= 5:
            factors.append(f"High historical reliability ({donor.historical_donations} donations)")

        if donor.compatibility_score == 1.0:
            factors.append("Exact blood match (100% compatible)")

        if context_dict["past_accept_rate"] >= 0.7:
            factors.append(f"High response loyalty ({int(context_dict['past_accept_rate'] * 100)}% accept rate)")

        # Noticeable fatigue penalty factor
        if fatigue_penalty >= 0.05:
            factors.append(f"Fatigue penalty applied: -{fatigue_penalty:.2f} (notified {hours_since_notified:.1f}h ago)")

        return {
            "donor_id": donor.donor_id,
            "name": donor.name,
            "blood_group": donor.blood_group,
            "distance_km": round(donor.distance_km, 2),
            "response_probability": round(final_prob, 3),
            "response_probability_percent": round(final_prob * 100, 1),
            "predicted_eta_minutes": travel_eta_mins,
            "recommendation": rec,
            "badge_color": color,
            "model_breakdown": {
                "xgboost_probability": round(xgb_prob, 3),
                "heuristic_probability": round(heuristic_prob, 3),
                "blend_ratio": blend_ratio,
                "is_cold_start": is_cold_start,
                "model_type": "XGBoost Fallback" if is_cold_start else "LinUCB Contextual Bandit",
                "linucb_score": round(linucb_score, 4) if linucb_score is not None else None,
                "fatigue_penalty": round(fatigue_penalty, 4),
                "hours_since_last_notified": round(hours_since_notified, 1),
                "context_features": context_dict,
            },
            "key_factors": factors,
        }

    def batch_rank_donors(
        self,
        donors: List[DonorFeatureInput],
    ) -> List[Dict[str, Any]]:
        """Rank an entire pool of matching donors by acceptance likelihood."""
        scored = [self.predict(d) for d in donors]
        scored.sort(key=lambda x: x["response_probability"], reverse=True)
        return scored

    def record_feedback(
        self,
        donor_id: str,
        accepted: bool,
        context: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Records feedback for a donor dispatch and updates bandit model."""
        return self.bandit.record_feedback(donor_id=donor_id, accepted=accepted, context=context)


# Global singleton predictor instance
DONOR_PREDICTOR = XGBoostDonorPredictor()


def record_feedback(
    donor_id: str,
    accepted: bool,
    context: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Public module-level function to record donor acceptance/rejection feedback.
    Updates the LinUCB bandit model parameters and saves its state to disk.

    Parameters:
        donor_id: ID of the donor
        accepted: True if the donor accepted the request, False if declined
        context: Optional context dictionary or numpy array
    """
    return DONOR_PREDICTOR.record_feedback(donor_id=donor_id, accepted=accepted, context=context)


def record_notification(donor_id: str) -> None:
    """Records that a donor was notified at the current timestamp for fatigue tracking."""
    DONOR_PREDICTOR.bandit.record_notification(donor_id)
