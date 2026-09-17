# Pulse — Real-Time Collaborative AI Workspace

A shared document workspace where multiple users see each other's live cursors
and edits in real time, and can trigger AI suggestions that stream
token-by-token into the shared document without clobbering concurrent human
edits. Backend is WebSocket-based; Redis pub/sub fans updates out across
server instances so the system isn't limited to a single process.

## Stack

- **Frontend**: React 18 + TypeScript, Vite, [`yjs`](https://github.com/yjs/yjs)
- **Backend**: Node 20 + Express (HTTP only) + `ws` (WebSocket), TypeScript
- **CRDT**: Yjs (`Y.Doc` / `Y.Text`), hand-rolled WebSocket sync protocol —
  see [`packages/backend/src/protocol.ts`](packages/backend/src/protocol.ts)
  (not the pre-built `y-websocket` server)
- **Pub/sub**: Redis via `ioredis`, for cross-instance fanout
- **AI**: Anthropic Claude API, streaming mode, via `@anthropic-ai/sdk`

## Repository structure

```
pulse/
  packages/
    frontend/   React app — editor, cursors, presence, AI button
    backend/    Express + ws server, Yjs room state, Redis fanout, AI streaming
  .env.example
```

## Setup

### Prerequisites
- Node 20+
- pnpm (`npm install -g pnpm`)
- Redis reachable locally (`docker run -d -p 6379:6379 redis:7-alpine`, or
  `brew install redis && brew services start redis`)
- An Anthropic API key (only required to test the "Continue writing" feature)

### Install

```bash
pnpm install
```

### Configure environment

Copy the relevant blocks from `.env.example` into two files:

```bash
cp .env.example packages/backend/.env   # then trim to the backend/.env block
cp .env.example packages/frontend/.env  # then trim to the frontend/.env block
```

Or just create them directly:

**`packages/backend/.env`**
```
PORT=3001
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=sk-ant-...
NODE_ENV=development
```

**`packages/frontend/.env`**
```
VITE_WS_URL=ws://localhost:3001
```

### Run

In two terminals:

```bash
pnpm dev:backend
```
```bash
pnpm dev:frontend
```

Open http://localhost:5173, click **New document**, then open the resulting
`/room/:roomId` URL in a second browser window to test collaboration.

## Testing

### Concurrent-edit correctness test (section 10.2)

The single most important test in the project: two raw WebSocket clients
insert distinct strings into the same room at (nearly) the same time; asserts
both converge to an identical final document containing both strings intact.

```bash
pnpm test:concurrent
```

Requires the backend (and Redis) to be running.

### Load test (section 10.3, stretch)

Opens N WebSocket connections to the same room, sends periodic cursor
updates, and reports p50/p95/p99 broadcast latency.

```bash
pnpm --filter backend test:load -- --n=100 --durationMs=10000
```

### Manual multi-browser test (section 10.1)

Open the same room URL in a regular window and an incognito window. Verify:
both see the same content on load, typing in one appears in the other
within ~200ms, cursors are visible and update live, and "Continue writing"
streams visibly to both.

### Reconnect test (section 10.4)

With the app running, open dev tools, throttle the network to "offline" for
5 seconds, then restore it. The client should reconnect automatically with
no duplicated or lost content.

### Cross-instance fanout (stretch, section 3.2.1)

Run two backend instances against the same Redis and confirm a client on
instance A sees edits from a client on instance B:

```bash
PORT=3001 pnpm dev:backend
PORT=3002 pnpm dev:backend
```

Point one browser tab's `VITE_WS_URL` at `ws://localhost:3001` and another at
`ws://localhost:3002` (rebuild/reload the frontend between, or run two Vite
dev servers with different `.env` files), open the same room in both, and
confirm edits sync across the two backend processes via the
`room:{roomId}:updates` Redis channel.

## Deployment

- **Backend + Redis**: deploy `packages/backend` to Railway as a Node
  service (`pnpm --filter backend start`), and add Railway's managed Redis
  plugin — it will provide `REDIS_URL` as an environment variable
  automatically (wire it into the service's env). Set `ANTHROPIC_API_KEY`
  and `PORT` (Railway sets `PORT` itself; the server already reads it).
- **Frontend**: deploy `packages/frontend` to Vercel as a static Vite build
  (`pnpm --filter frontend build`, output `packages/frontend/dist`). Set
  `VITE_WS_URL` to your Railway backend's `wss://` URL.

This repo does not include actual Railway/Vercel deploy configuration beyond
what's needed to build — connect the repo in each platform's dashboard and
point it at the relevant package.

## Demo script (~90s, section 11)

1. Two browser windows, same room URL.
2. Type in window 1 — appears live in window 2 with a cursor label.
3. Type simultaneously in both, in different parts of the doc — both sets of
   edits land correctly (proves CRDT conflict resolution).
4. In window 1, click **Continue writing** (or ⌘J) — AI streams token by
   token, visible in both windows.
5. While AI is still streaming, type in window 2 — human edit and AI text
   both land correctly without corruption. **This is the money shot.**
6. Kill network on window 2, show "Reconnecting…" state, restore it, show
   resync.
7. (Stretch) Terminal with two backend processes on different ports, one
   client per instance, proving cross-instance sync via Redis.

## Interview talking points (section 12)

Write real answers to these before interviewing:

1. Why Yjs / CRDTs instead of operational transform or last-write-wins?
2. Why does the AI-token-as-Yjs-op design (relative positions, see
   [`streamSuggestion.ts`](packages/backend/src/ai/streamSuggestion.ts))
   avoid corrupting concurrent human edits?
3. Why is Redis pub/sub necessary once there's more than one server
   instance, and what specifically breaks without it?
4. What happens on reconnect, and why doesn't the client lose local edits
   made while offline?
5. What was the measured latency/concurrency number from the load test, and
   what was the bottleneck when pushing it higher?

## Acceptance checklist (section 13)

- [ ] Two independent browsers join the same room and see synced content
- [ ] Live cursors visible and updating for both users
- [ ] Concurrent typing in different parts of the doc doesn't corrupt either
      user's input (verified by `pnpm test:concurrent`)
- [ ] AI "Continue writing" streams visibly into the doc for all connected
      clients
- [ ] AI streaming concurrent with a second user's typing doesn't corrupt
      either
- [ ] Reconnect after a network drop resyncs without data loss or
      duplication
- [ ] Deployed to a public URL, reachable from a network other than the one
      it was built on
- [ ] Health check endpoint exists and returns 200 (`GET /health`)
- [ ] Terminal logging shows connection/disconnect/merge/Redis-publish
      events clearly enough to narrate live
- [ ] Demo recording exists, under 90 seconds
- [ ] Real (not estimated) concurrency/latency number from `test:load`
- [ ] Written answers to the 5 interview questions above
