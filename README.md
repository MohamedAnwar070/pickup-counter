# Pickup Counter

A robust, high-concurrency pickup counter service and web application. Designed for reliable stock reservations with automatic expiry, HMAC-SHA256 authenticated webhook processing, idempotent state transitions, and concurrency-safe single-claim pickups.

## Tech Stack

- **Backend**: NestJS, PostgreSQL 16 (`pg` driver, plain SQL), TypeScript, Jest, Supertest
- **Frontend**: React, Vite, TypeScript
- **Infrastructure**: Docker & Docker Compose

## Repository Structure

```
pickup-counter/
├── backend/          # NestJS backend service (inventory, orders, payments, webhooks)
├── frontend/         # React + Vite frontend application
├── docs/             # Specifications and requirements
│   └── REQUIREMENTS.md
├── .gitignore        # Git ignore rules for node, dist, and environment files
└── README.md         # Project documentation
```

## Core Guarantees & Architecture

1. **Integer Arithmetic**: Money is calculated strictly in integer paise; formatted into rupees only on the display layer.
2. **Authoritative Pricing & Time**: Prices and expiry are always read from PostgreSQL (`clock_timestamp()`).
3. **Inventory Holds & Concurrency**: Product reservations utilize row-level locking (`SELECT ... FOR UPDATE`, sorted by ID) inside database transactions to guarantee stock never oversells or goes negative.
4. **Webhook Security & Idempotency**: Payment callbacks are verified using raw-body HMAC-SHA256 signatures with constant-time comparison (`crypto.timingSafeEqual`) and primary key deduplication.
5. **Single Claim Winner**: Conditional atomic updates guarantee that exactly one pickup claim succeeds per order.

For detailed requirements and acceptance criteria, refer to [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md).
