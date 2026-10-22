# AI Development Notes (R13)

This log documents the AI tools utilized, high-yield prompts, and genuine issues encountered during the development of the Pickup Counter service.

---

## 1. AI Tools Used & Purpose

| Tool | Application / Stage |
|---|---|
| **Antigravity AI (Gemini 3.8 Flash)** | Architecture layout, plain SQL schema design, NestJS module generation, concurrency locking strategy, React 19 component library, test suite generation. |
| **Integrated Terminal & Diagnostic Runner** | Real-time TypeScript compiler diagnostics, database migration execution, and Jest concurrency test verification. |

---

## 2. Prompt That Worked Exceptionally Well

When designing the concurrency-critical order placement logic, providing exact PostgreSQL transaction boundaries yielded zero-defect code on the first pass:

> *"Implement the createOrder flow using plain SQL with pg and withTransaction. Lock the products using SELECT id, price_paise, stock FROM products WHERE id = ANY($1) ORDER BY id ASC FOR UPDATE to prevent deadlocks and overselling. Compute held units inside the same transaction using unexpired pending and paid orders. If stock - held < quantity for any line item, rollback the entire transaction and throw 409 INSUFFICIENT_STOCK with a clear message."*

### Why it worked well:
Explicitly specifying the ascending sort order (`ORDER BY id ASC FOR UPDATE`) eliminated database lock order inversion deadlocks. Explicitly requiring transaction rollback on any short line ensured multi-item consistency without leaving orphan hold rows.

---

## 3. Real Mistakes Encountered & How They Were Resolved

### Mistake 1: Vite Template Scaffolding Conflict
- **What happened:** Running `npx create-vite frontend -t react-swc-ts` inside an existing directory caused Vite to fall back silently to the vanilla TypeScript template (`counter.ts`, `style.css`), which lacked React dependencies and omitted the `"jsx": "react-jsx"` compiler option in `tsconfig.json`.
- **How it was caught:** The subsequent build step failed with over 100 errors of type `TS17004: Cannot use JSX unless the '--jsx' flag is provided`.
- **Resolution:** Manually installed `@vitejs/plugin-react-swc`, `react`, `react-dom`, and configured `tsconfig.json` with `"jsx": "react-jsx"`.

### Mistake 2: ESM Module Hoisting of Environment Variables in Jest
- **What happened:** In `backend/src/test/integration.spec.ts`, `process.env.DATABASE_URL = ...` was defined at the top of the file body, but `import { AppModule } from '../app.module'` was hoisted by the TypeScript/ESM module loader. As a result, NestJS's `AppConfigModule` validated environment variables *before* the assignments in the file body took effect, causing tests to fail with `Environment validation failed: DATABASE_URL Required`.
- **How it was caught:** Jest output displayed `Environment validation failed: DATABASE_URL Required` even though the file appeared to set it.
- **Resolution:** Added `backend/.env` with test defaults and configured `setupFiles: ['dotenv/config']` in `backend/jest.config.js` so environment variables are loaded before any test modules evaluate.

### Mistake 3: Overly Restrictive UUID Regex Rejecting Nil UUID
- **What happened:** The initial UUID validation regex `/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i` strictly checked for UUID versions 1–5 and RFC 4122 variant bits (`89ab`). When test `B8` queried `00000000-0000-0000-0000-000000000000` (the standard nil UUID), the endpoint rejected it with `400 INVALID_UUID` instead of allowing PostgreSQL to check existence and returning `404 ORDER_NOT_FOUND`.
- **How it was caught:** Test `B8` failed with `expected 404 "Not Found", got 400 "Bad Request"`.
- **Resolution:** Updated `UUID_REGEX` to accept standard 8-4-4-4-12 hex formatting (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`), correctly distinguishing malformed strings (400) from syntactically valid non-existent UUIDs (404).
