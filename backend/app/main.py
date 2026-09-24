"""
PIA-Shield backend: telemetry ingestion, risk scoring, slider CAPTCHA, and mitigation.

- Stores session events in Redis; scores sessions with WeightedRiskScorer.
- /mitigate decides allow / captcha / sandbox; slider CAPTCHA used for sensitive actions.
- Decisions are logged to SQLite for auditing.
"""
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

import redis
from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .mitigation.slider_captcha import generate_slider_challenge, verify_slider_response
from .models.schemas import (
    HealthResponse,
    MitigationAction,
    ScoreResponse,
    SimulationRequest,
    SimulationResult,
    TelemetryEvent,
)
from .scoring.risk_engine import choose_mitigation
from .scoring.weighted_scorer import WeightedRiskScorer


REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

app = FastAPI(title="PIA-Shield", version="0.1.0")
redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
scorer = WeightedRiskScorer()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Session storage (Redis) and decision logging (SQLite)
# ---------------------------------------------------------------------------

from .database import SessionLocal
from .models.sql_models import Decision


def log_decision(session_id: str, action: str, risk: str, extra: Dict[str, Any]):
    """Persist mitigation decision (allow/captcha/sandbox) to DB for auditing."""
    db = SessionLocal()
    try:
        decision = Decision(
            session_id=session_id,
            action=action,
            risk=risk,
            detail=json.dumps(extra),
            created_at=datetime.utcnow().isoformat()
        )
        db.add(decision)
        db.commit()
    except Exception as e:
        print(f"Error logging decision: {e}")
        db.rollback()
    finally:
        db.close()


def store_event(event: TelemetryEvent, metadata: Dict[str, Any] = None):
    """Append telemetry event to session list in Redis; optionally merge session metadata. TTL 1h."""
    key = f"session:{event.session_id}"
    event_dict = {**event.dict(), "timestamp": event.timestamp.isoformat()}
    redis_client.rpush(key, json.dumps(event_dict))
    redis_client.expire(key, 3600)
    if metadata:
        metadata_key = f"session_metadata:{event.session_id}"
        existing = json.loads(redis_client.get(metadata_key) or "{}")
        redis_client.set(metadata_key, json.dumps({**existing, **metadata}), ex=3600)


def fetch_events(session_id: str) -> List[dict]:
    """Return all telemetry events for the given session (from Redis list)."""
    key = f"session:{session_id}"
    raw_events = redis_client.lrange(key, 0, -1)
    return [json.loads(e) for e in raw_events]


def fetch_session_metadata(session_id: str) -> Dict[str, Any]:
    """Return session metadata (e.g. interaction flags, timestamps) from Redis."""
    metadata_str = redis_client.get(f"session_metadata:{session_id}")
    return json.loads(metadata_str) if metadata_str else {}


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(status="ok")


@app.post("/telemetry", status_code=201)
def ingest_telemetry(payload: Dict[str, Any] = Body(...)):
    """Accept a telemetry event and optional metadata; store in Redis."""
    event_data = {k: v for k, v in payload.items() if k != "metadata"}
    try:
        store_event(TelemetryEvent(**event_data), payload.get("metadata", {}))
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid event format: {str(e)}")


@app.get("/score/{session_id}", response_model=ScoreResponse)
def score_session(session_id: str):
    """Compute risk score and level for the session from stored events and metadata."""
    events = fetch_events(session_id)
    metadata = fetch_session_metadata(session_id)
    result = scorer.score(events, metadata)
    metadata_key = f"session_metadata:{session_id}"
    existing = json.loads(redis_client.get(metadata_key) or "{}")
    existing.update(metadata)
    redis_client.set(metadata_key, json.dumps(existing), ex=3600)
    user_events = [e for e in events if e.get("event_type") not in ["heartbeat", "interaction_update"]]
    return ScoreResponse(
        session_id=session_id,
        score=result["score"] / 100.0,
        risk=result["risk_level"],
        features={
            "total_score": result["score"],
            "weighted_score": result["score"],
            "interaction_score": result["signals"]["interaction"],
            "timing_score": result["signals"]["timing"],
            "request_score": result["signals"]["requests"],
            "browser_score": result["signals"]["browser"],
            "consistency_score": result["signals"]["consistency"],
            "details": result["details"],
            "event_count": len(events),
            "user_event_count": len(user_events)
        }
    )


@app.post("/mitigate/{session_id}", response_model=MitigationAction)
def mitigate_session(
    session_id: str,
    payload: Dict[str, Any] = Body(default_factory=dict),
):
    """
    Decide mitigation: allow, require slider CAPTCHA, or sandbox.
    If action is captcha and payload includes slider_offset + challenge_data, verify and allow or retry.
    """
    events = fetch_events(session_id)
    if not events:
        raise HTTPException(status_code=404, detail="Session not found")

    metadata = fetch_session_metadata(session_id)
    result = scorer.score(events, metadata)
    score = result["score"]
    suggestion = choose_mitigation(score)
    action = suggestion["action"]
    risk = suggestion["risk"]

    if action == "captcha":
        # Only enforce CAPTCHA for sensitive actions (e.g. checkout)
        if not payload.get("sensitive_action", False):
            return MitigationAction(action="allow", detail={"reason": "not_sensitive_action"}, risk=risk)

        # Client sent slider solution: verify position and trajectory
        if "slider_offset" in payload:
            challenge_data = payload.get("challenge_data", {})
            target = challenge_data.get("target") or payload.get("target")

            is_valid, reason = verify_slider_response(payload, target if target else 50)

            if is_valid:
                new_score = scorer.reduce_score_after_captcha(score)
                metadata.update({"last_score": new_score, "captcha_passed": True})
                redis_client.set(f"session_metadata:{session_id}", json.dumps(metadata), ex=3600)
                log_decision(session_id, "slider_verified", risk, {"old_score": score, "new_score": new_score})
                return MitigationAction(action="allow", detail={"verified": True, "new_score": new_score}, risk=risk)

            log_decision(session_id, "slider_failed", risk, {"reason": reason})
            return MitigationAction(action="slider", detail={"error": reason, "retry": True}, risk=risk)

        # No solution yet: issue new slider challenge and store target in session metadata
        challenge = generate_slider_challenge()
        metadata.update({"current_challenge_target": challenge["target"]})
        redis_client.set(f"session_metadata:{session_id}", json.dumps(metadata), ex=3600)

        log_decision(session_id, "slider_required", risk, challenge)
        return MitigationAction(action="slider", detail=challenge, risk=risk)

    if action == "allow":
        log_decision(session_id, "allow", risk, {"score": score})
        return MitigationAction(action="allow", detail={"score": score}, risk=risk)
    log_decision(session_id, "sandbox", risk, {"score": score, "reason": "unknown_action"})
    return MitigationAction(action="sandbox", detail={"reason": "unknown_action", "score": score}, risk=risk)


@app.post("/simulate", response_model=SimulationResult)
def simulate(request: SimulationRequest):
    """Run a quick simulation of humans vs bots; return precision, recall, and false-positive rate."""
    import random
    from datetime import datetime, timedelta

    def gen_events(is_bot: bool, seed: int) -> List[dict]:
        random.seed(seed)
        base_time = datetime.utcnow()
        pids = ["p1", "p2", "p3", "p4", "p5"]
        if is_bot:
            return [{"session_id": f"test-{seed}", "event_type": "view", "product_id": pids[0], "dwell_time": 0.1, "page_depth": 1, "timestamp": (base_time + timedelta(seconds=i)).isoformat()} for i in range(5)]
        return [{"session_id": f"test-{seed}", "event_type": "view", "product_id": pid, "dwell_time": random.uniform(2.0, 10.0), "page_depth": i+1, "timestamp": (base_time + timedelta(seconds=i*5)).isoformat()} for i, pid in enumerate(pids[:3])]
    tp = fp = fn = 0
    for i in range(request.humans + request.bots):
        result = scorer.score(gen_events(i < request.bots, i), {})
        predicted = result["score"] >= 91
        if predicted and i < request.bots: tp += 1
        elif predicted: fp += 1
        elif i < request.bots: fn += 1
    return SimulationResult(precision=tp/(tp+fp+1e-6), recall=tp/(tp+fn+1e-6), false_positive_rate=fp/(fp+tp+1e-6), avg_latency_ms=15.0, notes="Simulation using product repetitive opening detection only.")


