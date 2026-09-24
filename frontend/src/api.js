import axios from "axios";

/**
 * API client for the PIA-Shield backend (FastAPI).
 * Base URL: VITE_API_BASE or http://127.0.0.1:8000.
 */

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

/** Send a telemetry event (and optional session metadata) to the backend. Retries without metadata on first failure. */
export async function sendTelemetry(event, metadata = {}) {
  try {
    await axios.post(
      `${API_BASE}/telemetry`,
      {
        ...event,
        metadata: metadata,
      },
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Failed to send telemetry:", err);
    try {
      await axios.post(`${API_BASE}/telemetry`, event);
    } catch (fallbackErr) {
      console.error("Failed to send telemetry (fallback):", fallbackErr);
    }
  }
}

/** Get current risk score and features for a session (GET /score/{sessionId}). */
export async function fetchScore(sessionId) {
  const res = await axios.get(`${API_BASE}/score/${sessionId}`);
  return res.data;
}

/** Request mitigation decision; optional payload for CAPTCHA (e.g. slider_offset, challenge_data, sensitive_action). */
export async function requestMitigation(sessionId, payload = {}) {
  const res = await axios.post(`${API_BASE}/mitigate/${sessionId}`, payload);
  return res.data;
}

