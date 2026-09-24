from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# Pydantic models for API request/response validation.
# TelemetryEvent: single event from frontend. ScoreResponse/MitigationAction: API responses.

class TelemetryEvent(BaseModel):
    """One telemetry event (view, add_to_cart, checkout, heartbeat, or interaction_update)."""
    session_id: str = Field(..., example="sess-123")
    user_id: Optional[str] = Field(None, example="user-42")
    event_type: str = Field(..., pattern=r"^(view|add_to_cart|checkout|heartbeat|interaction_update)$")
    product_id: Optional[str] = Field(None, example="prod-1")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    dwell_time: float = Field(ge=0, default=0.0, description="Seconds on page")
    page_depth: int = Field(ge=0, default=0, description="How deep in the nav tree")
    referer: Optional[str] = Field(None, description="Previous page")


class ScoreResponse(BaseModel):
    """Response from GET /score/{session_id}: normalized score, risk level, and feature breakdown."""
    session_id: str
    score: float
    risk: str
    features: dict


class MitigationAction(BaseModel):
    """Response from POST /mitigate: action (allow/slider/sandbox), detail payload, risk label."""
    action: str
    detail: dict
    risk: str


class SimulationRequest(BaseModel):
    humans: int = 20
    bots: int = 5
    seed: int = 42


class SimulationResult(BaseModel):
    precision: float
    recall: float
    false_positive_rate: float
    avg_latency_ms: float
    notes: str


class HealthResponse(BaseModel):
    status: str

