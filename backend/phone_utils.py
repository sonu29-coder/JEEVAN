"""
HEMO-GRID AI / JEEVAN - Indian Mobile Number Normalization & Validation
Validates 10-digit Indian mobile numbers starting with 6, 7, 8, or 9
and formats them to standard E.164 (+91XXXXXXXXXX) format.
"""

import re
from typing import Tuple

# Indian mobile numbers: 10 digits starting with 6, 7, 8, or 9
INDIAN_MOBILE_REGEX = re.compile(r"^[6-9]\d{9}$")


def normalize_indian_phone(phone_input: str) -> str:
    """
    Normalizes an Indian phone number to E.164 format (+91XXXXXXXXXX).
    Accepts formats like:
      - 9876543210
      - 09876543210
      - +919876543210
      - 919876543210
      - +91 98765 43210
      - +91-98765-43210
    Raises ValueError with user-friendly message if invalid.
    """
    if not phone_input or not isinstance(phone_input, str):
        raise ValueError("Please enter a valid mobile number.")

    # Remove all whitespace, hyphens, parentheses, plus, dots
    raw = phone_input.strip()
    digits_only = re.sub(r"[^\d]", "", raw)

    # Handle country code prefixes
    if raw.startswith("+91") and len(digits_only) == 12:
        digits_only = digits_only[2:]
    elif digits_only.startswith("91") and len(digits_only) == 12:
        digits_only = digits_only[2:]
    elif digits_only.startswith("0") and len(digits_only) == 11:
        digits_only = digits_only[1:]

    if not INDIAN_MOBILE_REGEX.match(digits_only):
        raise ValueError("Please enter a valid mobile number.")

    return f"+91{digits_only}"


def format_indian_phone_display(normalized_phone: str) -> str:
    """
    Formats +919876543210 to '+91 98765 43210' for friendly UI display.
    """
    if normalized_phone.startswith("+91") and len(normalized_phone) == 13:
        p = normalized_phone[3:]
        return f"+91 {p[:5]} {p[5:]}"
    return normalized_phone


def mask_indian_phone(normalized_phone: str) -> str:
    """
    Masks middle digits: '+91 XXXXX 43210' for secure UI display.
    """
    if normalized_phone.startswith("+91") and len(normalized_phone) == 13:
        p = normalized_phone[3:]
        return f"+91 XXXXX {p[5:]}"
    return normalized_phone
