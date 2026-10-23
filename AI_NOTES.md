# AI Notes

## Tools used

- **Claude Code (Anthropic)**: my main assistant for the whole project. I used it to scaffold the NestJS modules and React pages, draft the plain-SQL migrations and queries, write the Jest integration tests, and debug failing builds and tests. I reviewed every change, ran it locally, and kept the design decisions (locking strategy, status lifecycle, webhook rules) for myself.

## A prompt that worked well

> "Implement the createOrder flow using plain SQL with pg and withTransaction. Lock the products using `SELECT id, price_paise, stock FROM products WHERE id = ANY($1) ORDER BY id ASC FOR UPDATE` to prevent deadlocks and overselling. Compute held units inside the same transaction using unexpired pending and paid orders. If stock − held < quantity for any line item, roll back the entire transaction and throw 409 INSUFFICIENT_STOCK."

It worked because it named the exact lock statement, the lock order and the rollback rule. Nothing was left for the model to guess, and the 10-buyers-for-2-units test (B17) passed on the first run.

## A real mistake it made

The first version of the payment webhook decided "paid in time" from a single `expires_at <= clock_timestamp()` check made when it locked the **order** row, then marked the order paid **without locking the product rows**. `createOrder` treats a pending order as free stock the moment it expires. So a webhook that arrived at 119.9 s and committed just after 120 s could leave the same last unit promised to two customers. The happy-path tests all passed, so they didn't show the problem. I caught it while reviewing the code against the "never sell twice" requirement.

**Fix:** the webhook now locks the order's product rows (same ascending-id order as `createOrder`) *before* it reads the clock. A payment that crosses the boundary goes through the late-payment stock check. Test **D25** holds a rival lock across the expiry and fails on the old code (`paid`) but passes on the new code (`needs_review`).
