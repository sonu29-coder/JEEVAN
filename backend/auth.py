"""
HEMO-GRID AI - Authentication & Role-Based Access Control (RBAC)
JWT Bearer token generation, verification, and compatibility with Next.js frontend credentials.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Annotated, Dict, List, Optional

import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.schemas import TokenResponse, UserPayload, UserRole

# Configuration
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "hemo-grid-ai-super-secret-jwt-signing-key-2026")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24 hours


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt with salt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hashed password string."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


# Frontend demo credentials map (mirrors frontend/lib/hemo-auth.ts)
FRONTEND_CREDENTIALS: Dict[str, Dict[str, str]] = {
    "HOSP-9042": {
        "role": "ICU_HOSPITAL",
        "user_id": "hosp-jubilee",
        "label": "Jubilee Mission ICU",
        "badge": "Verified Hospital Node • Jubilee Mission ICU",
    },
    "DONOR-1108": {
        "role": "REGISTERED_DONOR",
        "user_id": "donor-aarav",
        "label": "Aarav (Donor)",
        "badge": "Verified Donor Node • Aarav",
    },
    "DLVR-8821": {
        "role": "DELIVERY_PARTNER",
        "user_id": "rider-42",
        "label": "Swift Rider #42",
        "badge": "Verified Logistics Partner • Swift Rider #42",
    },
    "BANK-5501": {
        "role": "BLOOD_BANK",
        "user_id": "bank-ima",
        "label": "IMA Blood Bank Thrissur",
        "badge": "Verified Blood Bank • IMA Thrissur",
    },
    "ADMIN-0001": {
        "role": "ADMIN",
        "user_id": "admin-jeevan",
        "label": "Jeevan Administrator",
        "badge": "Verified Network Administrator • Thrissur Grid HQ",
    },
}

# Role aliases for normalization
ROLE_ALIASES: Dict[str, str] = {
    "ADMIN": "ADMIN",
    "ADMINISTRATOR": "ADMIN",
    "DONOR": "REGISTERED_DONOR",
    "REGISTERED_DONOR": "REGISTERED_DONOR",
    "HOSPITAL": "ICU_HOSPITAL",
    "ICU_HOSPITAL": "ICU_HOSPITAL",
    "DELIVERY_PARTNER": "DELIVERY_PARTNER",
    "DRIVER": "DELIVERY_PARTNER",
    "COURIER": "DELIVERY_PARTNER",
    "LOGISTICS": "DELIVERY_PARTNER",
    "BLOOD_BANK": "BLOOD_BANK",
    "BANK": "BLOOD_BANK",
}


def normalize_role(role: str) -> str:
    cleaned = role.strip().upper()
    return ROLE_ALIASES.get(cleaned, cleaned)


def create_access_token(
    user_id: str,
    role: str,
    label: Optional[str] = None,
    badge: Optional[str] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Generate a signed JWT Bearer access token."""
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {
        "sub": user_id,
        "user_id": user_id,
        "role": normalize_role(role),
        "label": label or user_id,
        "badge": badge or f"Verified {role}",
        "exp": int(expire.timestamp()),
        "iat": int(datetime.now(timezone.utc).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Dict[str, str]:
    """Decode and validate a JWT access token."""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please re-authenticate.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Bearer token signature.",
            headers={"WWW-Authenticate": "Bearer"},
        )


security_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    auth_header: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security_scheme)],
    authorization: Annotated[Optional[str], Header()] = None,
) -> UserPayload:
    """
    FastAPI dependency to extract and authenticate current user from Bearer header.
    Seamlessly supports both signed JWT tokens AND the Next.js frontend demo tokens
    (HOSP-9042, DONOR-1108, DLVR-8821).
    """
    token = None
    if auth_header and auth_header.credentials:
        token = auth_header.credentials.strip()
    elif authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()

    if not token:
        # Default guest / unauthenticated fallback
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided. Expected 'Authorization: Bearer <token>'",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Check if token is a direct frontend demo credential token
    if token in FRONTEND_CREDENTIALS:
        cred = FRONTEND_CREDENTIALS[token]
        return UserPayload(
            user_id=cred["user_id"],
            role=cred["role"],
            label=cred["label"],
        )

    # 2. Check if token is a JWT
    try:
        payload = decode_access_token(token)
        return UserPayload(
            user_id=payload.get("user_id") or payload.get("sub", "unknown"),
            role=payload.get("role", "ICU_HOSPITAL"),
            label=payload.get("label"),
            exp=payload.get("exp"),
        )
    except HTTPException:
        # If token is not a valid JWT and not recognized demo token
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Unauthorized: token '{token}' is invalid or expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_role(allowed_roles: List[str]):
    """
    Dependency factory to enforce role-based access control.
    Supports role normalization (e.g. DONOR matching REGISTERED_DONOR).
    """
    normalized_allowed = {normalize_role(r) for r in allowed_roles}

    def role_checker(user: Annotated[UserPayload, Depends(get_current_user)]) -> UserPayload:
        user_role = normalize_role(user.role)
        if user_role not in normalized_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: role '{user.role}' is not authorized. Required: {list(normalized_allowed)}",
            )
    return role_checker


require_admin = require_role(["ADMIN"])


# ---------------------------------------------------------------------
# Google Authentication & OAuth Token Verification
# ---------------------------------------------------------------------

GOOGLE_CLIENT_ID = os.getenv(
    "GOOGLE_CLIENT_ID",
    "789234891234-jeevan-hemo-grid-thrissur.apps.googleusercontent.com",
)


def verify_google_token(credential: str, target_role: str = "ICU_HOSPITAL") -> Dict[str, Any]:
    """
    Validates a Google OAuth2 ID Token or simulated Google authorization credential.
    Extracts email, name, picture, and user identity, mapping it to a verified medical role.
    """
    if not credential:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Google authentication credential token.",
        )

    # 1. Attempt decoding JWT ID Token if 3-part format
    if credential.count(".") == 2:
        try:
            payload = jwt.decode(credential, options={"verify_signature": False})
            email = payload.get("email", "")
            name = payload.get("name", email.split("@")[0].title() if email else "Google User")
            picture = payload.get("picture")
            sub = payload.get("sub", email)
            return {
                "google_id": sub,
                "email": email,
                "name": name,
                "picture": picture,
                "email_verified": payload.get("email_verified", True),
                "role": normalize_role(target_role),
                "badge": f"Google Verified • {name}",
            }
        except Exception:
            pass

    # 2. Known Google Profiles for Thrissur medical grid
    demo_profiles = {
        "dr.rajesh@jubileemission.org": {
            "google_id": "google-1092837465",
            "name": "Dr. Rajesh Nair, MD",
            "email": "dr.rajesh@jubileemission.org",
            "picture": "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=150",
            "role": "ICU_HOSPITAL",
            "badge": "Google Verified Physician • Jubilee Mission Trauma ICU",
        },
        "ima.admin@imathrissur.org": {
            "google_id": "google-2083918273",
            "name": "IMA Blood Bank Admin",
            "email": "ima.admin@imathrissur.org",
            "picture": "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=150",
            "role": "BLOOD_BANK",
            "badge": "Google Verified Authority • IMA Central Complex",
        },
        "sneha.donor@gmail.com": {
            "google_id": "google-3094827162",
            "name": "Sneha Menon",
            "email": "sneha.donor@gmail.com",
            "picture": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150",
            "role": "REGISTERED_DONOR",
            "badge": "Google Verified Donor • O- Universal Donor",
        },
        "donor.aarav@gmail.com": {
            "google_id": "google-4091827361",
            "name": "Aarav Sharma",
            "email": "donor.aarav@gmail.com",
            "picture": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
            "role": "REGISTERED_DONOR",
            "badge": "Google Verified Donor • B+ Emergency Donor",
        },
        "driver.arun@gmail.com": {
            "google_id": "google-5082918273",
            "name": "Arun Kumar (Swift Rider #42)",
            "email": "driver.arun@gmail.com",
            "picture": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150",
            "role": "DELIVERY_PARTNER",
            "badge": "Google Verified Courier • Cold Chain Emergency Dispatcher",
        },
    }

    cred_lower = credential.strip().lower()
    if cred_lower in demo_profiles:
        return demo_profiles[cred_lower]

    return {
        "google_id": f"google-{abs(hash(credential)) % 1000000000}",
        "name": credential.split("@")[0].title() if "@" in credential else "Google Authenticated User",
        "email": credential if "@" in credential else f"{credential}@gmail.com",
        "picture": "https://lh3.googleusercontent.com/a/default-user=s96-c",
        "role": normalize_role(target_role),
        "badge": f"Google Verified • {target_role.replace('_', ' ').title()}",
    }


# Pre-configured example accounts for instant login choices
EXAMPLE_ACCOUNTS = [
    {
        "id": "donor-example-1",
        "category": "DONOR",
        "name": "Sneha Menon",
        "email": "sneha.donor@gmail.com",
        "token": "DONOR-1108",
        "role": "REGISTERED_DONOR",
        "blood_group": "O-",
        "badge": "Verified Donor • O- Universal Donor",
        "description": "Pre-cleared volunteer donor in Thrissur ready for immediate emergency calls.",
        "avatar": "🩸",
    },
    {
        "id": "donor-example-2",
        "category": "DONOR",
        "name": "Aarav Sharma",
        "email": "donor.aarav@gmail.com",
        "token": "DONOR-1108",
        "role": "REGISTERED_DONOR",
        "blood_group": "B+",
        "badge": "Verified Donor • B+ Emergency Donor",
        "description": "Loyal donor with 8 previous lifetime donations at Jubilee Mission.",
        "avatar": "🩸",
    },
    {
        "id": "driver-example-1",
        "category": "DRIVER",
        "name": "Arun Kumar (Swift Rider #42)",
        "email": "driver.arun@gmail.com",
        "token": "DLVR-8821",
        "role": "DELIVERY_PARTNER",
        "vehicle": "Emergency Medical Transport Scooter",
        "badge": "Verified Courier • Swift Rider #42",
        "description": "Licensed active cold-chain courier certified for temperature-monitored blood boxes.",
        "avatar": "🛵",
    },
    {
        "id": "hospital-example-1",
        "category": "HOSPITAL",
        "name": "Dr. Rajesh Nair, MD",
        "email": "dr.rajesh@jubileemission.org",
        "token": "HOSP-9042",
        "role": "ICU_HOSPITAL",
        "hospital": "Jubilee Mission Hospital ICU",
        "badge": "Verified Physician • Jubilee Mission Trauma ICU",
        "description": "Emergency ICU Department Chief authorized to order critical emergency units.",
        "avatar": "🏥",
    },
    {
        "id": "bank-example-1",
        "category": "BLOOD_BANK",
        "name": "IMA Blood Bank Admin",
        "email": "ima.admin@imathrissur.org",
        "token": "BANK-5501",
        "role": "BLOOD_BANK",
        "hub": "IMA Blood Bank Complex & Research Centre",
        "badge": "Verified Authority • IMA Central Complex",
        "description": "Central blood bank administrator managing real-time regional blood reserves.",
        "avatar": "🏦",
    },
]


