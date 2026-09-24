"""
Slider CAPTCHA: generates puzzle challenges and verifies human-like drag behavior.

Validates both final slider position and mouse trajectory to detect bots that
snap directly to the target (no natural movement) or move unrealistically fast.
"""
import random
import math
from typing import Dict, List, Tuple, Any


def generate_slider_challenge() -> Dict[str, Any]:
    """Create a new slider challenge with a random target position (10–90%)."""
    target = random.randint(10, 90)
    return {
        "target": target,
        "detail": {
            "instructions": "Drag the slider to fit the puzzle piece.",
            "target_position": target,
        },
    }


def verify_slider_response(data: Dict[str, Any], target: int) -> Tuple[bool, str]:
    """
    Verify the user's slider submission: position accuracy and human-like trajectory.

    - Accepts offset from either "offset" or "slider_offset" for API flexibility.
    - Position must be within 5% of target.
    - Trajectory must have at least 5 points (deters instant teleport).
    - Total drag time must be at least 100 ms (deters superhuman speed).
    """
    user_offset = data.get("offset") or data.get("slider_offset")
    trajectory = data.get("trajectory", [])

    if user_offset is None:
        return False, "Missing offset"

    if abs(user_offset - target) > 5:
        return False, f"Incorrect position. Target: {target}, Got: {user_offset}"

    # Require enough trajectory points to infer natural movement (anti-teleport)
    if not trajectory or len(trajectory) < 5:
        return False, "Trajectory too short (teleportation?)"

    speeds: List[float] = []
    first_point = trajectory[0]
    last_point = trajectory[-1]

    total_time = last_point.get("t", 0) - first_point.get("t", 0)
    if total_time < 100:
        return False, "Movement too fast (superhuman)"

    # Compute per-segment speeds for potential variance checks (e.g. bot constant speed)
    prev_point = first_point
    for point in trajectory[1:]:
        dx = point["x"] - prev_point["x"]
        dy = point["y"] - prev_point["y"]
        dt = point["t"] - prev_point["t"]

        if dt > 0:
            speed = math.sqrt(dx * dx + dy * dy) / dt
            speeds.append(speed)

        prev_point = point

    # Variance of speeds could be used for stricter bot detection (e.g. too uniform)
    if speeds:
        avg_speed = sum(speeds) / len(speeds)
        _ = sum((s - avg_speed) ** 2 for s in speeds) / len(speeds)

    return True, "Verified"
