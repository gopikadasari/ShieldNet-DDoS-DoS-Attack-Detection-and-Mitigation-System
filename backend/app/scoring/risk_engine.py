"""
Maps numeric behavior score (0–100) to risk label and mitigation action.

Score bands: human (≤30), medium (31–60), high (61–90), bot (91+).
Actions: allow for human; captcha for medium/high; sandbox for bot.
"""
from typing import Dict


def risk_from_score(score: float) -> str:
    """Convert raw score to risk level: human, medium, high, or bot."""
    if score <= 30:
        return "human"
    elif score <= 60:
        return "medium"
    elif score <= 90:
        return "high"
    else:
        return "bot"


def choose_mitigation(score: float) -> Dict[str, str]:
    """Return recommended action and risk label. Used by /mitigate to decide allow/captcha/sandbox."""
    risk = risk_from_score(score)
    if risk == "human":
        return {"action": "allow", "risk": risk}
    elif risk == "medium":
        return {"action": "captcha", "risk": risk}
    elif risk == "high":
        return {"action": "captcha", "risk": risk}
    else:
        return {"action": "sandbox", "risk": risk}


