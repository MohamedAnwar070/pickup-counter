# Pickup Counter: Commands & Developer Guide

Quick, simple reference for running, testing, and developing the project.

---

## 1. Daily Development Mode (Instant Hot-Reload)

Use this mode when you are **editing code or styling the UI**. Any change you save will update immediately without rebuilding containers.

### Step 1: Start only PostgreSQL in Docker
```bash
docker compose up -d db
```
*(If the full Docker stack was already running, stop the web and API containers first: `docker compose stop web api`)*

### Step 2: Start the Backend (Terminal 1)
```bash
npm run dev:backend
```
* Runs NestJS on `http://localhost:3000` with file-watch mode.
* Automatically recompiles on any save in `backend/src/`.

### Step 3: Start the Frontend (Terminal 2)
```bash
npm run dev:frontend
```
* Runs Vite on `http://localhost:5173`.
* Instant Hot Module Replacement (HMR) on any save in `frontend/src/`.

---

## 2. Full Docker Mode (Cold Start / Interview Demo)

Use this mode when you want to **demo the exact production build** to an interviewer or verify a clean cold start from scratch.

### Start everything in Docker
```bash
docker compose up --build -d
```
* Database, API, and Web run in isolated containers.
* Access the app at: `http://localhost:5173`
* Access the API at: `http://localhost:3000`

### View live logs
```bash
# All logs:
docker compose logs -f

# Only API logs:
docker compose logs -f api

# Only Web logs:
docker compose logs -f web
```

### Stop all containers
```bash
docker compose down
```

### Fresh restart from scratch (wipes database volume for clean slate)
```bash
docker compose down -v
docker compose up --build -d
```

---

## 3. Testing Commands

All tests run against a real PostgreSQL database (zero mocks). The test database `pickup_test` is created automatically on the first run.

### 🌟 Run the Signature Concurrency Test (B17)
Simulates 10 buyers racing simultaneously for the last 2 units:
```bash
npm run test:concurrency
```
*Expected: Exactly 2 succeed (201), 8 receive conflict (409), stock never drops below 0.*

### Run all 73 integration and unit tests
```bash
npm test
```

### Run tests in interactive watch mode while coding
```bash
npm run test:watch
```

### Run code quality linting
```bash
npm run lint
```

---

## 4. Payment Webhook Commands (CLI Helper)

Use the built-in CLI tool to send real HMAC-SHA256 signed payment webhooks to test payment outcomes.

*(Note: The web app payment screen also displays the exact command for your active order ready to copy!)*

### Normal successful payment
Fetches the order's exact total from the API automatically:
```bash
npm run send-webhook -- --orderId <ORDER_UUID>
```

### Amount mismatch (Triggers `needs_review`)
Sends a payment with the wrong amount (e.g. ₹10.00 instead of order total):
```bash
npm run send-webhook -- --orderId <ORDER_UUID> --amount 1000
```

### Bad signature (Triggers `401 Unauthorized`)
Sends a tampered HMAC signature to test security rejection:
```bash
npm run send-webhook -- --orderId <ORDER_UUID> --bad-sig
```

### Duplicate webhook replay (Tests idempotency)
Sends the exact same webhook twice to verify it returns `{ duplicate: true }`:
```bash
npm run send-webhook -- --orderId <ORDER_UUID> --eventId evt_fixed_test_123
```

---

## 5. Database Commands

### Run SQL migrations manually
```bash
npm run migrate
```

### Seed products manually (only seeds if table is empty)
```bash
npm run seed
```

---

## 6. Ports Summary

| Service | Port | URL |
|---|---|---|
| **Frontend Web App** | `5173` | `http://localhost:5173` |
| **Backend REST API** | `3000` | `http://localhost:3000` |
| **PostgreSQL Database** | `5432` | `localhost:5432` (`postgres:postgres`) |
