# Adapter Swap Handbook: DB Outbox Polling vs Redis BullMQ

This 1-page guide explains how to swap between `@plinth/adapter-queue-db` and `@plinth/adapter-queue-bullmq`.

---

## 1. Architectural Comparison

| Dimension | DB Outbox Polling (`adapter-queue-db`) | Redis BullMQ (`adapter-queue-bullmq`) |
|---|---|---|
| **Backing Engine** | SQL table `outbox_events` via `DatabasePort` | Redis cluster via `bullmq` v6 |
| **Transactionality** | 100% atomic dual-write with business entities | Asynchronous enqueue (or 2-phase Outbox to BullMQ relay) |
| **Concurrency** | Atomic conditional `UPDATE ... WHERE locked_by` claim | Redis Lua scripts & streaming consumer groups |
| **Dead Letter Queue** | Status transitions: `pending` -> `processing` -> `failed` | Native BullMQ DLQ with exponential retry backoff |

---

## 2. When to Use Which
- **Use DB Outbox (`adapter-queue-db`)**:
  - $0 Free-tier survival mode (no separate Redis instance required).
  - Strict financial or audit events where transactional atomicity is non-negotiable.
- **Use BullMQ (`adapter-queue-bullmq`)**:
  - High-throughput asynchronous pipelines (thousands of jobs/second).
  - Heavy compute jobs, audio/video transcoding, scheduled cron delays.

---

## 3. Swap Steps

### To Switch to BullMQ:
```bash
pnpm add @plinth/adapter-queue-bullmq
```
In `src/server.ts` or `src/worker.ts`:
```typescript
import { BullMqQueueAdapter } from "@plinth/adapter-queue-bullmq";

const queue = new BullMqQueueAdapter({
  connection: { url: process.env.REDIS_URL! },
  queueName: "default-queue",
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 1000 },
  },
});
await queue.start();
```

### Verification:
```bash
pnpm test:queue
```
Both adapters pass 100% of the shared `QueuePort` contract tests.
