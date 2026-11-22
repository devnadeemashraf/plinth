# Social Media Backend API — Plinth Example

An interactive, production-structured social media backend API illustrating how to build vertical business logic using **Plinth** backend primitives, pure ports and adapters, and type-safe contracts.

---

## 🏛️ Architecture Highlights

- **HTTP Driver:** Plinth `FastifyHttpAdapter` providing high-throughput JSON handling and automated OpenAPI 3.1 generation.
- **Database Driver:** Plinth `SqliteDatabaseAdapter` providing zero-config local persistence (and in-memory support for testing).
- **Identifier Precision:** RFC 9562 UUIDv7 monotonic IDs for chronological post and comment ordering.
- **Permission Engine:** $O(1)$ BigInt bitmasks enforcing granular capabilities (`POST_CREATE`, `POST_DELETE`, `COMMENT_CREATE`, `MODERATE_POSTS`).
- **Interactive Documentation:** Day-one Scalar API Reference UI at `/docs` and raw OpenAPI 3.1 spec at `/openapi.json`.
- **Health Probes:** Container-ready liveness probe at `/health/live` and database ping readiness probe at `/health/ready`.

---

## 🚀 Running the Example

From the repository root:

```bash
# 1. Install dependencies
pnpm install

# 2. Run the tests verifying the entire social API
pnpm --filter @plinth/example-social-media test

# 3. Start the live API server
pnpm --filter @plinth/example-social-media dev
```

The server will boot on `http://localhost:3001`:

- 📖 **Scalar API Docs:** `http://localhost:3001/docs`
- 📜 **OpenAPI 3.1 Spec:** `http://localhost:3001/openapi.json`
- 💓 **Liveness Probe:** `http://localhost:3001/health/live`
- 🩺 **Readiness Probe:** `http://localhost:3001/health/ready`

---

## 💻 Interactive `curl` Walkthrough

### 1. Register Users

```bash
# Register Alice
curl -X POST http://localhost:3001/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"handle": "alice", "displayName": "Alice Wonderland", "bio": "Software engineer"}'

# Register Bob
curl -X POST http://localhost:3001/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"handle": "bob", "displayName": "Bob Builder", "bio": "Distributed systems fan"}'

# Register Moderator Charlie
curl -X POST http://localhost:3001/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"handle": "mod_charlie", "displayName": "Charlie Moderator", "isModerator": true}'
```

### 2. Follow User

```bash
# Bob follows Alice (pass Bob's ID in x-user-id and Alice's ID in URL)
curl -X POST http://localhost:3001/api/v1/users/<ALICE_USER_ID>/follow \
  -H "x-user-id: <BOB_USER_ID>"
```

### 3. Create a Post

```bash
# Alice creates a post
curl -X POST http://localhost:3001/api/v1/posts \
  -H "Content-Type: application/json" \
  -H "x-user-id: <ALICE_USER_ID>" \
  -d '{"content": "Building backends with clean hexagonal ports! #typescript #backend"}'
```

### 4. Query Timeline Feed

```bash
# Bob views his personalized feed (contains posts from Alice)
curl http://localhost:3001/api/v1/feed?limit=10 \
  -H "x-user-id: <BOB_USER_ID>"
```

### 5. Like & Comment on a Post

```bash
# Bob likes Alice's post
curl -X POST http://localhost:3001/api/v1/posts/<POST_ID>/like \
  -H "x-user-id: <BOB_USER_ID>"

# Bob comments on Alice's post
curl -X POST http://localhost:3001/api/v1/posts/<POST_ID>/comments \
  -H "Content-Type: application/json" \
  -H "x-user-id: <BOB_USER_ID>" \
  -d '{"content": "Awesome post! Loved the hexagonal boundaries."}'

# List comments on the post
curl http://localhost:3001/api/v1/posts/<POST_ID>/comments
```

### 6. Test Permission-Based Moderation

```bash
# Bob attempts to delete Alice's post -> 403 Forbidden
curl -X DELETE http://localhost:3001/api/v1/posts/<POST_ID> \
  -H "x-user-id: <BOB_USER_ID>"

# Moderator Charlie deletes the post -> 200 OK
curl -X DELETE http://localhost:3001/api/v1/posts/<POST_ID> \
  -H "x-user-id: <CHARLIE_MODERATOR_ID>"
```
