"""
HEMO-GRID AI - Gemini AI Service with Multi-Language Support (i18n)
Supports English, Tamil (தமிழ்), Hindi (हिन्दी), and Malayalam (മലയാളം).
Integrates with Google Gemini AI API with fallback localized templates.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional
import httpx

logger = logging.getLogger(__name__)

LANGUAGE_MAP: Dict[str, str] = {
    "ta": "Tamil",
    "hi": "Hindi",
    "ml": "Malayalam",
    "en": "English",
}

LANGUAGE_CODE_FROM_NAME: Dict[str, str] = {
    "tamil": "ta",
    "hindi": "hi",
    "malayalam": "ml",
    "english": "en",
}


def parse_target_language(user_language_header: Optional[str] = None) -> str:
    """
    Parses the X-User-Language header and maps it to the target language name:
    - 'ta' -> 'Tamil'
    - 'hi' -> 'Hindi'
    - 'ml' -> 'Malayalam'
    - 'en' -> 'English' (default fallback)
    """
    if not user_language_header:
        return "English"

    clean_header = user_language_header.strip().lower()
    # Match 2-letter prefix if provided as 'ta-IN', 'en-US', etc.
    code = clean_header.split("-")[0].split("_")[0]
    return LANGUAGE_MAP.get(code, "English")


async def call_gemini_api(prompt: str) -> Optional[str]:
    """
    Calls the Google Gemini REST API if GEMINI_API_KEY or GOOGLE_API_KEY is configured.
    """
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return None

    model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 300,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=4.5) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts and "text" in parts[0]:
                        return parts[0]["text"].strip()
    except Exception as exc:
        logger.warning("Gemini API call failed or timed out: %s", exc)

    return None


# ---------------------------------------------------------------------
# 1. TRIAGE SUMMARY GENERATOR (ICE / Citizen Emergency)
# ---------------------------------------------------------------------

FALLBACK_TRIAGE_SUMMARIES = {
    "Tamil": {
        "P1": "🚨 நிலை 1 அதிதீவிர அவசர மதிப்பீடு: கடுமையான ரத்தப்போக்கு மற்றும் அதிர்ச்சி கண்டறியப்பட்டது. அருகிலுள்ள அவசர ட்ராமா மையத்தில் உடனடியாக பெருமளவு ரத்த மாற்ற நெறிமுறை (MTP) தொடங்கப்பட்டது.",
        "P2": "⚠️ நிலை 2 அவசர ட்ரியேஜ்: நோயாளி நிலை சீராக உள்ளது, ஆனால் அடுத்த 30 நிமிடங்களுக்குள் ரத்த மாற்றம் தேவைப்படுகிறது. ரத்த வங்கிக்கு தகவல் அனுப்பப்பட்டுள்ளது.",
        "P3": "ℹ️ நிலை 3 வழக்கமான மதிப்பீடு: உடனடி ஆபத்தில்லை. திட்டமிடப்பட்ட சிகிச்சைக்காக அவசரமற்ற ரத்த இருப்பு சரிபார்க்கப்பட்டது.",
    },
    "Hindi": {
        "P1": "🚨 स्तर 1 अति-गंभीर ट्राइएज अलर्ट: गंभीर रक्तस्राव और ट्रॉमा की पुष्टि। निकटतम ट्रॉमा सेंटर में तत्काल मैसिव ट्रांसफ्यूजन प्रोटोकॉल (MTP) सक्रिय किया गया।",
        "P2": "⚠️ स्तर 2 आपातकालीन ट्राइएज: रोगी की स्थिति स्थिर लेकिन 30 मिनट के भीतर रक्त आधान अनिवार्य है। रक्त बैंक को अलर्ट भेजा गया।",
        "P3": "ℹ️ स्तर 3 नियमित ट्राइएज: कोई तात्कालिक खतरा नहीं। नियोजित उपचार हेतु आवश्यक रक्त समूह स्टॉक सुरक्षित किया गया।",
    },
    "Malayalam": {
        "P1": "🚨 ലെവൽ 1 അതീവ ഗുരുതര ട്രയാജ് അലേർട്ട്: കഠിനമായ രക്തസ്രാവവും ഷോക്കും സ്ഥിരീകരിച്ചു. അടുത്തുള്ള ട്രോമ സെന്ററിൽ അടിയന്തര രക്തപ്പകർച്ച പ്രോട്ടോക്കോൾ (MTP) ആരംഭിച്ചു.",
        "P2": "⚠️ ലെവൽ 2 അടിയന്തര ട്രയാജ്: രോഗിയുടെ അവസ്ഥ നിലവിൽ സുസ്ഥിരമാണ്, എന്നാൽ 30 മിനിറ്റിനുള്ളിൽ രക്തം നൽകേണ്ടതുണ്ട്. ബ്ലഡ് ബാങ്കിലേക്ക് വിവരം നൽകി.",
        "P3": "ℹ️ ലെവൽ 3 സാധാരണ ട്രയാജ്: ഉടനടി അപകടസാധ്യതയില്ല. മുൻകൂട്ടി നിശ്ചയിച്ച ചികിത്സയ്ക്കായി രക്തഗ്രൂപ്പ് സ്റ്റോക്ക് നീക്കിവെച്ചു.",
    },
    "English": {
        "P1": "🚨 Level-1 Critical Triage Alert: Severe acute trauma hemorrhage detected. Massive Transfusion Protocol (MTP) activated at designated regional trauma facility.",
        "P2": "⚠️ Level-2 Urgent Care: Patient hemodynamically stable but requires transfusion within 30 minutes. Blood bank reservation in progress.",
        "P3": "ℹ️ Level-3 Non-Urgent Triage: Routine clinical monitoring. Elective blood allocation confirmed.",
    },
}


async def generate_triage_summary(
    symptoms: str,
    severity: str = "P1",
    user_language_header: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generates an emergency triage assessment summary in the user's selected language.
    """
    target_language = parse_target_language(user_language_header)
    clean_severity = severity.upper() if severity.upper() in ["P1", "P2", "P3"] else "P1"

    prompt = (
        f"You are JEEVAN Emergency AI Triage Doctor. "
        f"A citizen in Chennai reported emergency symptoms: '{symptoms}'. Severity rating: {clean_severity}. "
        f"Provide a concise, 2-sentence clinical triage summary and immediate next step instruction. "
        f"CRITICAL REQUIREMENT: Output your entire response in {target_language}. Do not use English."
    )

    ai_result = await call_gemini_api(prompt)
    if not ai_result:
        lang_dict = FALLBACK_TRIAGE_SUMMARIES.get(target_language, FALLBACK_TRIAGE_SUMMARIES["English"])
        ai_result = lang_dict.get(clean_severity, lang_dict["P1"])

    return {
        "summary": ai_result,
        "severity": clean_severity,
        "language": target_language,
        "language_code": LANGUAGE_CODE_FROM_NAME.get(target_language.lower(), "en"),
    }


# ---------------------------------------------------------------------
# 2. DONOR NOTIFICATION GENERATOR (Donor Dashboard)
# ---------------------------------------------------------------------

FALLBACK_DONOR_NOTIFICATIONS = {
    "Tamil": "🚨 அவசர இரத்தக் கோரிக்கை: {hospital} மருத்துவமனையில் {units} யூனிட் {blood_group} இரத்தம் அவசரமாகத் தேவைப்படுகிறது ({urgency}). தயவுசெய்து அருகிலுள்ள ரத்த மையத்திற்கு விரைந்து வந்து உயிரைக் காப்பாற்றுங்கள்.",
    "Hindi": "🚨 तत्काल रक्त अलर्ट: {hospital} को {units} यूनिट {blood_group} रक्त की तुरंत आवश्यकता है ({urgency})। कृपया निकटतम रक्त केंद्र पहुंचकर जीवन रक्षा में सहयोग करें।",
    "Malayalam": "🚨 അടിയന്തര രക്തദാന അറിയിപ്പ്: {hospital} ആശുപത്രിയിൽ {units} യൂണിറ്റ് {blood_group} രക്തം അടിയന്തരമായി ആവശ്യമുണ്ട് ({urgency}). ദയവായി അടുത്തുള്ള ബ്ലഡ് ബാങ്കിലെത്തി ജീവൻ രക്ഷിക്കുക.",
    "English": "🚨 Urgent Blood Alert: {hospital} urgently requires {units} units of {blood_group} ({urgency}). Please respond or proceed to the nearest blood collection bay to save a life.",
}


async def generate_donor_notification(
    hospital_name: str,
    blood_group: str,
    units: int,
    urgency: str = "CRITICAL",
    user_language_header: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generates a personalized emergency donor notification in the user's selected language.
    """
    target_language = parse_target_language(user_language_header)

    prompt = (
        f"You are JEEVAN Blood Network Dispatcher. "
        f"Generate an urgent donor notification SMS/Push alert for a volunteer donor. "
        f"Details: Hospital: {hospital_name}, Blood Group: {blood_group}, Units: {units}, Urgency: {urgency}. "
        f"Keep it under 30 words, highly respectful, clear, and urgent. "
        f"CRITICAL REQUIREMENT: Output your entire response in {target_language}. Do not use English."
    )

    ai_result = await call_gemini_api(prompt)
    if not ai_result:
        template = FALLBACK_DONOR_NOTIFICATIONS.get(target_language, FALLBACK_DONOR_NOTIFICATIONS["English"])
        ai_result = template.format(
            hospital=hospital_name,
            blood_group=blood_group,
            units=units,
            urgency=urgency.upper(),
        )

    return {
        "notification": ai_result,
        "target_hospital": hospital_name,
        "blood_group": blood_group,
        "units": units,
        "language": target_language,
        "language_code": LANGUAGE_CODE_FROM_NAME.get(target_language.lower(), "en"),
    }


# ---------------------------------------------------------------------
# 3. DELIVERY INSTRUCTIONS GENERATOR (Delivery Dashboard)
# ---------------------------------------------------------------------

FALLBACK_DELIVERY_INSTRUCTIONS = {
    "Tamil": "🛵 பசுமை வழித்தட விநியோக வழிகாட்டுதல்: {bank} இரத்த வங்கியிலிருந்து {units} யூனிட் {blood_group} குளிர் பெட்டியைப் பெற்று, அண்ணா சாலை வழியாக {icu} ICU அவசர பிரிவுக்கு கொண்டு சேர்க்கவும். குளிர் பெட்டி வெப்பநிலையை 2°C - 6°C பராமரித்து, ICU செவிலியரிடம் 4-இலக்க OTP கொடுத்து விநியோகத்தை உறுதி செய்யவும்.",
    "Hindi": "🛵 ग्रीन कॉरिडोर डिलीवरी निर्देश: {bank} रक्त बैंक से {units} यूनिट {blood_group} का इंसुलेटेड बॉक्स प्राप्त करें और अन्ना सलाई मार्ग से {icu} आईसीयू पहुंचे। बॉक्स का तापमान 2°C - 6°C बनाए रखें और आईसीयू स्टाफ के साथ ओटीपी हैंडशेक पूरा करें।",
    "Malayalam": "🛵 ഗ്രീൻ കോറിഡോർ ഡെലിവറി നിർദ്ദേശം: {bank} ബ്ലഡ് ബാങ്കിൽ നിന്ന് {units} യൂണിറ്റ് {blood_group} കോൾഡ് ബോക്സ് കൈപ്പറ്റി, {icu} ഐസിയുവിലേക്ക് ഗ്രീൻ കോറിഡോർ വഴി എത്തിക്കുക. ബോക്സ് താപനില 2°C - 6°C ൽ നിലനിർത്തുകയും ഐസിയുവിൽ ഒടിപി വെരിഫിക്കേഷൻ പൂർത്തിയാക്കുകയും ചെയ്യുക.",
    "English": "🛵 Green Corridor Transit Instructions: Collect {units} units of {blood_group} cold-box from {bank}. Proceed via cleared Anna Salai arterial route to {icu} ICU bay. Maintain cold-chain at 2°C - 6°C and complete handshake verification using hospital OTP.",
}


async def generate_delivery_instructions(
    pickup_bank: str,
    dropoff_icu: str,
    blood_group: str,
    units: int,
    user_language_header: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generates dispatch transit instructions in the courier's selected language.
    """
    target_language = parse_target_language(user_language_header)

    prompt = (
        f"You are JEEVAN Green Corridor Logistics Coordinator. "
        f"Generate clear dispatch courier transit instructions for blood delivery. "
        f"Pickup: {pickup_bank}, Destination: {dropoff_icu}, Item: {units} units of {blood_group}. "
        f"Include mention of cold-chain temperature (2-6°C) and hospital OTP handover. "
        f"CRITICAL REQUIREMENT: Output your entire response in {target_language}. Do not use English."
    )

    ai_result = await call_gemini_api(prompt)
    if not ai_result:
        template = FALLBACK_DELIVERY_INSTRUCTIONS.get(target_language, FALLBACK_DELIVERY_INSTRUCTIONS["English"])
        ai_result = template.format(
            bank=pickup_bank,
            icu=dropoff_icu,
            blood_group=blood_group,
            units=units,
        )

    return {
        "instructions": ai_result,
        "pickup_bank": pickup_bank,
        "dropoff_icu": dropoff_icu,
        "blood_group": blood_group,
        "units": units,
        "language": target_language,
        "language_code": LANGUAGE_CODE_FROM_NAME.get(target_language.lower(), "en"),
    }
