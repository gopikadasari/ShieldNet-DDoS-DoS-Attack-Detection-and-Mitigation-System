# PIA-Shield

**Behavior-based bot detection that removes CAPTCHAs for real users.**

Most sites show every visitor a CAPTCHA. PIA-Shield watches how a session behaves instead: what it browses, how often it repeats itself, and how long it sits idle. From that it gives the session a risk score. Real shoppers never see a challenge. Suspicious sessions get a slider CAPTCHA only when they try something sensitive such as checkout. Sessions that look clearly automated are sent to a read-only sandbox.

The repository has a **FastAPI** risk engine and a **React** demo storefront wired to it.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Risk Scoring](#risk-scoring)
- [Slider CAPTCHA Verification](#slider-captcha-verification)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Try It Out](#try-it-out)
- [Limitations & Roadmap](#limitations--roadmap)

---

## How It Works

```
 ┌──────────────────────┐   telemetry (view / add_to_cart /     ┌───────────────────────┐
 │  React storefront    │   checkout / heartbeat / interaction) │   FastAPI backend     │
 │  (Vite, port 5173)   │ ────────────────────────────────────▶ │   (port 8000)         │
 │                      │                                       │                       │
 │  • tracks mouse,     │ ◀──────── score + risk level ──────── │  WeightedRiskScorer   │
 │    scroll, clicks    │                                       │        │              │
 │  • heartbeat / 10 s  │ ◀── allow │ slider │ sandbox ──────── │  choose_mitigation()  │
 └──────────┬───────────┘                                       └───┬───────────┬───────┘
            │ bot / failed CAPTCHA                                  │           │
            ▼                                                       ▼           ▼
 ┌──────────────────────┐                                    ┌──────────┐ ┌──────────────┐
 │  Sandbox storefront  │                                    │  Redis   │ │   SQLite     │
 │  read-only, no       │                                    │ sessions │ │ decision log │
 │  checkout            │                                    │ (1 h TTL)│ │              │
 └──────────────────────┘                                    └──────────┘ └──────────────┘
```

1. **Collect.** The storefront sends a telemetry event for every product view, add-to-cart and checkout. It also sends heartbeat and interaction updates in the background.
2. **Store.** The backend appends each event to a Redis list for that session. Sessions expire after 1 hour.
3. **Score.** `WeightedRiskScorer` turns the session's events into a score from 0 to 100.
4. **Decide.** The score maps to a risk level and an action: *allow*, *slider CAPTCHA* or *sandbox*.
5. **Audit.** Every decision the `/mitigate` endpoint makes is written to a SQLite `decisions` table.

---

## Risk Scoring

Every session starts at a baseline of **25**, which counts as human. Two signals can raise the score:

| Signal | Rule | Score impact |
|---|---|---|
| **Repeated product views** | The same product viewed consecutively 2 / 3 / 4 / 5+ times | +25 / +50 / +65 / +75 |
| **Inactivity** | No new user actions for *N* whole minutes | +25 per idle minute |

Heartbeat and interaction-update events never count as user actions.

The score then maps to a risk level and an action:

| Score | Risk level | Action |
|---|---|---|
| 0 – 30 | `human` | ✅ Allow, with no friction |
| 31 – 60 | `medium` | 🧩 Slider CAPTCHA on sensitive actions (up to 3 attempts) |
| 61 – 90 | `high` | 🧩 Slider CAPTCHA on sensitive actions (up to 2 attempts) |
| 91+ | `bot` | 🚫 Redirect to the sandbox |

Passing the CAPTCHA takes **40 points** off the session's score.

---

## Slider CAPTCHA Verification

The slider challenge asks the user to drag a puzzle piece to a random target between 10% and 90% of the track. The frontend records the whole drag path as `(x, y, t)` points. The backend rejects a submission if any of these checks fail:

| Check | Rule | Catches |
|---|---|---|
| Position | Within ±5% of the target | Guessing |
| Trajectory length | At least 5 recorded points | Scripts that jump straight to the target |
| Duration | Drag takes at least 100 ms | Movement faster than a human can manage |

In the frontend, the CAPTCHA has a **60-second** timer. If time runs out, or the user uses up all their attempts, the session is sent to the sandbox.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | Python, FastAPI, Uvicorn, Pydantic |
| Session store | Redis |
| Audit log | SQLite with SQLAlchemy |
| Frontend | React 18, Vite 5, Axios |
| Testing | Vitest, Testing Library |

---

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app and endpoints
│   │   ├── database.py              # SQLite engine and session
│   │   ├── models/
│   │   │   ├── schemas.py           # Pydantic request/response models
│   │   │   └── sql_models.py        # Decision audit table
│   │   ├── scoring/
│   │   │   ├── weighted_scorer.py   # Behavior signals → score (0–100)
│   │   │   └── risk_engine.py       # Score → risk level → action
│   │   └── mitigation/
│   │       └── slider_captcha.py    # Challenge generation and verification
│   ├── create_tables.py             # Creates the SQLite tables
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.jsx                  # Storefront, telemetry and checkout flow
    │   ├── SandboxApp.jsx           # Read-only sandbox storefront
    │   ├── components/
    │   │   └── SliderCaptcha.jsx    # Drag puzzle that records the trajectory
    │   ├── api.js                   # Backend API client
    │   ├── main.jsx                 # Chooses the storefront or the sandbox
    │   └── styles.css
    ├── spa_server.py                # Serves the built dist/ folder as a single-page app
    ├── vite.config.js
    └── package.json
```

---

## Getting Started

### Prerequisites

- **Python** 3.10 or newer
- **Node.js** 18 or newer, with npm
- **Redis** running on `localhost:6379`

```bash
# macOS (Homebrew)
brew install redis && brew services start redis

# or with Docker
docker run -d --name redis -p 6379:6379 redis:7
```

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python create_tables.py            # creates pia_shield_logs.db
uvicorn app.main:app --reload --port 8000
```

Interactive API docs are then at **http://127.0.0.1:8000/docs**.

> Run `create_tables.py` and `uvicorn` from inside `backend/`. The SQLite path is relative to the current folder.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**.

To build and serve a production version:

```bash
npm run build
python spa_server.py               # serves dist/ on port 5173
```

---

## Configuration

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `REDIS_URL` | backend | `redis://localhost:6379/0` | Redis connection string |
| `VITE_API_BASE` | frontend | `http://127.0.0.1:8000` | Backend base URL |
| `FRONTEND_PORT` | frontend | `5173` | Port for the Vite dev and preview servers |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/telemetry` | Takes one telemetry event, with optional `metadata` |
| `GET` | `/score/{session_id}` | Returns the session's score, risk level and signal breakdown |
| `POST` | `/mitigate/{session_id}` | Decides allow, slider or sandbox, and verifies slider answers |
| `POST` | `/simulate` | Scores synthetic human and bot sessions and reports precision and recall |

<details>
<summary><b>Example requests</b></summary>

**Send telemetry**

```bash
curl -X POST http://127.0.0.1:8000/telemetry \
  -H "Content-Type: application/json" \
  -d '{"session_id": "sess-123", "event_type": "view", "product_id": "p1", "dwell_time": 4.2, "page_depth": 1}'
```

`event_type` must be one of `view`, `add_to_cart`, `checkout`, `heartbeat` or `interaction_update`.

**Get a score**

```bash
curl http://127.0.0.1:8000/score/sess-123
```

```json
{
  "session_id": "sess-123",
  "score": 0.24,
  "risk": "human",
  "features": {
    "total_score": 24,
    "interaction_score": 0,
    "details": ["Single interaction recorded - score 24 (updates with more activity)"],
    "event_count": 1,
    "user_event_count": 1
  }
}
```

**Request mitigation for a sensitive action**

```bash
curl -X POST http://127.0.0.1:8000/mitigate/sess-123 \
  -H "Content-Type: application/json" \
  -d '{"sensitive_action": true}'
```

**Submit a slider answer**

```bash
curl -X POST http://127.0.0.1:8000/mitigate/sess-123 \
  -H "Content-Type: application/json" \
  -d '{
        "sensitive_action": true,
        "slider_offset": 47,
        "challenge_data": {"target": 45},
        "trajectory": [
          {"x": 10, "y": 200, "t": 0},   {"x": 60, "y": 201, "t": 80},
          {"x": 120, "y": 203, "t": 170}, {"x": 170, "y": 202, "t": 260},
          {"x": 205, "y": 202, "t": 350}
        ]
      }'
```

**Run a simulation**

```bash
curl -X POST http://127.0.0.1:8000/simulate \
  -H "Content-Type: application/json" \
  -d '{"humans": 20, "bots": 5}'
```

</details>

---

## Try It Out

With both servers running, open the storefront and try these:

| Scenario | What to do | Expected result |
|---|---|---|
| 🧑 Normal shopper | Browse a few different products, add to cart, check out | Score stays low and checkout needs no CAPTCHA |
| 🤔 Suspicious | View the same product 2–4 times in a row, then check out | Slider CAPTCHA appears at checkout |
| 🤖 Bot | View the same product 5 or more times in a row | Redirect to the sandbox, where checkout is disabled |
| 💤 Idle | Take no actions for a few minutes | Score rises by 25 for each idle minute |

---

## Limitations & Roadmap

- [ ] Timing, request-rate, browser-fingerprint and consistency signals are placeholders that always return 0.
- [ ] The scorer computes the variance of slider drag speed but doesn't use it yet. It could catch bots that move at a constant speed.
- [ ] CORS allows every origin (`*`). Restrict it before deploying.
- [ ] Add backend tests and CI.
- [ ] Replace or add to the rule-based scorer with an ML model. `scikit-learn` and `joblib` are already in the dependencies.

---

## Author

**Gopika Ratnam Dasari**: [@gopikadasari](https://github.com/gopikadasari)
