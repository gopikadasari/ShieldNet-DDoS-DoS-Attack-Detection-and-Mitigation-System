"""
Aggregates telemetry events and session metadata into a single risk score (0–100).

Uses signals like repetitive product views and inactivity; score is then mapped
to human/medium/high/bot by risk_engine.choose_mitigation().
"""
from typing import Dict, List, Any
from datetime import datetime


class WeightedRiskScorer:
    def __init__(self):
        self.score_thresholds = {"human": 30, "medium": 60, "high": 90, "bot": 91}

    def score(self, events: List[dict], session_metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        """Compute total score from events and metadata. Baseline 25; penalties for repetition, inactivity, etc."""
        total_score = 25
        signal_details = []
        metadata = session_metadata if session_metadata is not None else {}
        user_events = [e for e in events if e.get("event_type") not in ["heartbeat", "interaction_update"]]
        inactivity_score, inactivity_details = self._check_inactivity_penalty(len(user_events), metadata)
        total_score += inactivity_score
        signal_details.extend(inactivity_details)
        if not user_events:
            if inactivity_score == 0:
                signal_details.append("No user actions yet - baseline human score (25)")
            return {
                "score": total_score,
                "risk_level": self._get_risk_level(total_score),
                "signals": {"interaction": 0, "timing": 0, "requests": 0, "browser": 0, "consistency": 0},
                "details": signal_details,
            }
        interaction_score, interaction_details = (self._check_product_repetitive_views(user_events) if len(user_events) >= 2 else (0, []))
        total_score += interaction_score
        signal_details.extend(interaction_details)
        # Single event: slight score drop so UI shows "score updated" (25 -> 24)
        if len(user_events) == 1 and total_score == 25:
            total_score = 24
            signal_details.append("Single interaction recorded - score 24 (updates with more activity)")
        return {
            "score": total_score,
            "risk_level": self._get_risk_level(total_score),
            "signals": {
                "interaction": interaction_score,
                "timing": 0,
                "requests": 0,
                "browser": 0,
                "consistency": 0,
            },
            "details": signal_details,
        }

    def _check_product_repetitive_views(self, events: List[dict]) -> tuple:
        """Penalize consecutive views of the same product; higher count = larger score increase (bot-like)."""
        score, details = 0, []
        view_events = [e for e in events if e.get("event_type") == "view"]
        if len(view_events) >= 2:
            count, last_pid = 1, None
            for i in range(len(view_events) - 1, -1, -1):
                pid = view_events[i].get("product_id")
                if not pid: continue
                if last_pid is None: last_pid = pid
                elif pid == last_pid: count += 1
                else: break
            if count >= 5: score, details = 75, [f"BOT DETECTED: {count} consecutive views - Score: 100 (+75)"]
            elif count >= 4: score, details = 65, [f"Repeated product views: {count} consecutive views - Score: 90 (+65)"]
            elif count >= 3: score, details = 50, [f"Repeated product views: {count} consecutive views - Score: 75 (+50)"]
            elif count >= 2: score, details = 25, [f"Repeated product views: {count} consecutive views - Score: 50 (+25)"]
        return score, details

    def _check_inactivity_penalty(self, current_action_count: int, metadata: Dict[str, Any]) -> tuple:
        score, details = 0, []
        if metadata is None: metadata = {}
        last_count = metadata.get("last_action_count")
        last_time_str = metadata.get("last_action_count_time")
        if last_time_str is None:
            metadata.update({"last_action_count": current_action_count, "last_action_count_time": datetime.utcnow().isoformat()})
            return score, details
        if last_count is not None and current_action_count > last_count:
            metadata.update({"last_action_count": current_action_count, "last_action_count_time": datetime.utcnow().isoformat()})
            return score, details
        try:
            if isinstance(last_time_str, str):
                try: last_time = datetime.fromisoformat(last_time_str)
                except ValueError:
                    try: last_time = datetime.fromisoformat(last_time_str.replace('Z', '+00:00'))
                    except ValueError: last_time = datetime.fromisoformat(last_time_str.split('.')[0])
            else:
                metadata.update({"last_action_count": current_action_count, "last_action_count_time": datetime.utcnow().isoformat()})
                return score, details
            elapsed = (datetime.utcnow() - (last_time.replace(tzinfo=None) if last_time.tzinfo else last_time)).total_seconds()
            if elapsed < 0:
                metadata.update({"last_action_count": current_action_count, "last_action_count_time": datetime.utcnow().isoformat()})
                return score, details
            idle_min = int(elapsed / 60)
            if idle_min >= 1:
                penalty = idle_min * 25
                score += penalty
                details.append(f"Inactivity penalty: Action count unchanged for {idle_min} minute(s) - Score increased by {penalty} (+{penalty})")
        except (ValueError, TypeError):
            metadata.update({"last_action_count": current_action_count, "last_action_count_time": datetime.utcnow().isoformat()})
            return score, details
        metadata["last_action_count"] = current_action_count
        return score, details

    def _get_risk_level(self, score: float) -> str:
        if score >= self.score_thresholds["bot"]: return "bot"
        elif score > self.score_thresholds["medium"]: return "high"
        elif score > self.score_thresholds["human"]: return "medium"
        else: return "human"

    def reduce_score_after_captcha(self, current_score: float) -> float:
        return max(0, current_score - 40)
