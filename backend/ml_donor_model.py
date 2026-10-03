"""
HEMO-GRID AI - Donor Response Prediction Engine
Heuristic + XGBoost Machine Learning Model trained on synthetic Thrissur emergency dispatch datasets.
Predicts donor willingness, acceptance probability, and response ETA for emergency blood calls.
"""

from __future__ import annotations

import logging
import os
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import numpy as np
except ImportError:
    np = None

logger = logging.getLogger(__name__)

# Feature column order for ML training and inference
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


class SyntheticDatasetGenerator:
    """
    Generates synthetic medical emergency response datasets modeled after
    real-world Thrissur blood bank donor dispatch patterns.
    """

    @staticmethod
    def generate(num_samples: int = 3000, seed: int = 42) -> Tuple[np.ndarray, np.ndarray]:
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
        # Donors are more likely to respond if:
        # - Close proximity (low distance)
        # - High emergency urgency
        # - Prior history of donations (loyalty)
        # - Longer elapsed time since last donation (>120 days)
        # - Daytime hours (8am - 10pm vs late night)
        # - Low traffic congestion
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


class XGBoostDonorPredictor:
    """
    Trains and executes XGBoost classifier for donor acceptance predictions,
    blending results with the clinical heuristic model.
    """

    def __init__(self):
        self.model = None
        self.is_trained = False
        self.feature_importances: Dict[str, float] = {}
        self.metrics: Dict[str, Any] = {}
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
            }
            logger.info("XGBoost donor model trained successfully. Validation accuracy: %.2f%%", accuracy * 100)

        except Exception as e:
            logger.warning("XGBoost training encountered fallback mode: %s", e)
            self.is_trained = False
            self.metrics = {
                "status": "Heuristic Mode Active",
                "reason": str(e),
            }

    def predict(self, donor: DonorFeatureInput) -> Dict[str, Any]:
        """
        Predicts donor emergency response probability using blended XGBoost + Heuristic.
        """
        # 1. Compute baseline heuristic score
        heuristic_prob = HeuristicDonorScorer.score(donor)

        # 2. Compute XGBoost ML prediction
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

        # 3. Ensemble blending: 70% XGBoost ML + 30% Clinical Heuristic
        blended_prob = float(0.70 * xgb_prob + 0.30 * heuristic_prob)
        blended_prob = max(0.05, min(0.98, blended_prob))

        # ETA calculation: estimated driving time + 5 min preparation buffer
        travel_eta_mins = round((donor.distance_km / 35.0) * 60.0 + 5.0, 1)

        # Recommendation category
        if blended_prob >= 0.75:
            rec = "PRIMARY_RESPONDER"
            color = "#10b981"
        elif blended_prob >= 0.50:
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

        return {
            "donor_id": donor.donor_id,
            "name": donor.name,
            "blood_group": donor.blood_group,
            "distance_km": round(donor.distance_km, 2),
            "response_probability": round(blended_prob, 3),
            "response_probability_percent": round(blended_prob * 100, 1),
            "predicted_eta_minutes": travel_eta_mins,
            "recommendation": rec,
            "badge_color": color,
            "model_breakdown": {
                "xgboost_probability": round(xgb_prob, 3),
                "heuristic_probability": round(heuristic_prob, 3),
                "blend_ratio": "70% XGBoost + 30% Heuristic",
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


# Global singleton predictor instance
DONOR_PREDICTOR = XGBoostDonorPredictor()
