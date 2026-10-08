# ShieldNet

**A backend bot-detection API that lets genuine users through without CAPTCHAs.**

Most websites make every visitor solve a CAPTCHA to prove they're human. That annoys real users, and modern bots often solve them anyway.

ShieldNet takes a different approach. It watches **how each visitor behaves** and decides whether they look human or automated:

| Visitor | What ShieldNet does |
|---|---|
| 🧑 **Genuine user** | Lets them through, with **no CAPTCHA** |
| 🤔 **Suspicious** | Asks for a **slider CAPTCHA**, only at sensitive steps like checkout |
| 🤖 **Bot** | Blocks it by sending it to a **read-only sandbox** |

ShieldNet is a standalone **FastAPI** service, so **any website can use it** through simple REST calls. The repo also includes a small React storefront as a demo client.

---

## Contents

- [How It Works](#how-it-works)
- [Use It in Your Website](#use-it-in-your-website)
- [Detection Rules](#detection-rules)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Limitations & Roadmap](#limitations--roadmap)

---

## How It Works

```
   Your website / app                         ShieldNet API (FastAPI)
 ┌────────────────────┐   1. activity events   ┌──────────────────────────┐
 │  user views items, │ ─────────────────────▶ │  store events per session│──▶ Redis
 │  adds to cart,     │                        │                          │
 │  checks out        │   2. risk score        │  score session (0–100)   │
 │                    │ ◀───────────────────── │                          │
 │                    │   3. allow / slider /  │  decide + verify CAPTCHA │──▶ SQLite
 │                    │ ◀──── sandbox ──────── │                          │   (audit log)
 └────────────────────┘                        └──────────────────────────┘
```

1. **Collect.** Your site sends an event to ShieldNet each time a user does something, such as viewing a product, adding to cart or checking out.
2. **Score.** ShieldNet stores the events for each session in Redis and gives the session a risk score from **0 (human)** to **100 (bot)**.
3. **Decide.** When the user tries a sensitive action, your site asks ShieldNet what to do. The answer is *allow*, *slider CAPTCHA* or *sandbox*.
4. **Audit.** Every decision is saved to a SQLite database so you can review it later.

---

## Use It in Your Website

You only need **three API calls**:

```js
const SHIELDNET = "http://127.0.0.1:8000";

// 1. Report every user action
await fetch(`${SHIELDNET}/telemetry`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ session_id, event_type: "view", product_id: "p1" }),
});

// 2. (Optional) Check the current risk score
const score = await fetch(`${SHIELDNET}/score/${session_id}`).then(r => r.json());

// 3. Before a sensitive action, ask what to do
const decision = await fetch(`${SHIELDNET}/mitigate/${session_id}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ sensitive_action: true }),
}).then(r => r.json());

if (decision.action === "allow")   { /* continue to checkout */ }
if (decision.action === "slider")  { /* show slider CAPTCHA, then send the answer back to /mitigate */ }
if (decision.action === "sandbox") { /* block: send to a read-only page */ }
```

---

## Detection Rules

### Risk score

Every session starts at **25**, which counts as human. The score goes up when the session behaves like a bot:

| Behavior | Rule | Score added |
|---|---|---|
| **Repeating the same action** | Same product viewed 2 / 3 / 4 / 5+ times in a row | +25 / +50 / +65 / +75 |
| **Sitting idle** | No new user actions for a full minute | +25 per idle minute |

Background events (`heartbeat`, `interaction_update`) are not counted as user actions.

### Score → decision

| Score | Risk level | Decision |
|---|---|---|
| 0 – 30 | `human` | ✅ Allow, no CAPTCHA |
| 31 – 60 | `medium` | 🧩 Slider CAPTCHA at sensitive actions |
| 61 – 90 | `high` | 🧩 Slider CAPTCHA at sensitive actions |
| 91 – 100 | `bot` | 🚫 Sandbox |

A user who passes the CAPTCHA has **40 points** taken off their score.

### Slider CAPTCHA checks

The user drags a slider to a random target. The client records the drag path as `(x, y, time)` points, and ShieldNet checks it on the server:

| Check | Rule | Stops |
|---|---|---|
| Position | Within ±5% of the target | Random guessing |
| Path length | At least 5 recorded points | Scripts that jump straight to the answer |
| Speed | Drag takes at least 100 ms | Movement too fast for a human |

---

## Tech Stack

| Part | Technology |
|---|---|
| API | Python, FastAPI, Uvicorn, Pydantic |
| Session storage | Redis (sessions expire after 1 hour) |
| Audit log | SQLite with SQLAlchemy |
| Demo client | React 18, Vite |

---

## Getting Started

### Requirements

- Python 3.10 or newer
- Redis running on `localhost:6379`
- Node.js 18 or newer, only if you want to run the demo storefront

```bash
# Start Redis (pick one)
brew install redis && brew services start redis     # macOS
docker run -d --name redis -p 6379:6379 redis:7     # Docker
```

### Run the API

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python create_tables.py            # creates the SQLite audit database
uvicorn app.main:app --reload --port 8000
```

The API is now at **http://127.0.0.1:8000**, and interactive docs are at **http://127.0.0.1:8000/docs**.

> Run both commands from inside `backend/`. The database file is created in the current folder.

### Run the demo storefront (optional)

```bash
cd frontend
npm install
npm run dev                        # opens on http://localhost:5173
```

Things to try in the demo:

| Scenario | What to do | Result |
|---|---|---|
| Genuine user | Browse different products and check out | Checkout with no CAPTCHA |
| Suspicious | View the same product 2–4 times in a row, then check out | Slider CAPTCHA at checkout |
| Bot | View the same product 5+ times in a row | Sent to the sandbox |

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection for the API |
| `VITE_API_BASE` | `http://127.0.0.1:8000` | API address used by the demo storefront |

---

## API Reference

| Method | Endpoint | What it does |
|---|---|---|
| `GET` | `/health` | Checks that the API is running |
| `POST` | `/telemetry` | Records one user event |
| `GET` | `/score/{session_id}` | Returns the session's risk score and the reasons for it |
| `POST` | `/mitigate/{session_id}` | Returns allow / slider / sandbox, and verifies slider answers |
| `POST` | `/simulate` | Tests the scorer on fake human and bot sessions |

`event_type` must be one of `view`, `add_to_cart`, `checkout`, `heartbeat` or `interaction_update`.

<details>
<summary><b>Example requests and responses</b></summary>

**Record an event**

```bash
curl -X POST http://127.0.0.1:8000/telemetry \
  -H "Content-Type: application/json" \
  -d '{"session_id": "sess-123", "event_type": "view", "product_id": "p1"}'
```

**Get the risk score**

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
    "details": ["Single interaction recorded - score 24 (updates with more activity)"],
    "event_count": 1,
    "user_event_count": 1
  }
}
```

**Ask for a decision before checkout**

```bash
curl -X POST http://127.0.0.1:8000/mitigate/sess-123 \
  -H "Content-Type: application/json" \
  -d '{"sensitive_action": true}'
```

**Send a slider CAPTCHA answer**

```bash
curl -X POST http://127.0.0.1:8000/mitigate/sess-123 \
  -H "Content-Type: application/json" \
  -d '{
        "sensitive_action": true,
        "slider_offset": 47,
        "challenge_data": {"target": 45},
        "trajectory": [
          {"x": 10,  "y": 200, "t": 0},   {"x": 60,  "y": 201, "t": 80},
          {"x": 120, "y": 203, "t": 170}, {"x": 170, "y": 202, "t": 260},
          {"x": 205, "y": 202, "t": 350}
        ]
      }'
```

</details>

---

## Project Structure

```
backend/                         ← the ShieldNet API
├── app/
│   ├── main.py                  # API endpoints
│   ├── scoring/
│   │   ├── weighted_scorer.py   # behavior → risk score
│   │   └── risk_engine.py       # risk score → decision
│   ├── mitigation/
│   │   └── slider_captcha.py    # CAPTCHA challenge and verification
│   ├── models/                  # request/response and database models
│   └── database.py              # SQLite connection
├── create_tables.py             # sets up the audit database
└── requirements.txt

frontend/                        ← demo storefront that uses the API
└── src/
    ├── App.jsx                  # store, event tracking, checkout flow
    ├── SandboxApp.jsx           # read-only page shown to bots
    ├── components/SliderCaptcha.jsx
    └── api.js                   # calls to the ShieldNet API
```

---

## Limitations & Roadmap

- [ ] Only two behavior signals are active (repeated views and idle time). Timing, request rate, browser fingerprint and consistency checks are placeholders.
- [ ] The API accepts requests from any website (CORS `*`). Restrict this before deploying.
- [ ] Add automated tests and CI.
- [ ] Try a machine-learning model alongside the rule-based scorer.

---

## Author

**Gopika Ratnam Dasari** · [@gopikadasari](https://github.com/gopikadasari)
