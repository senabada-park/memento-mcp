# CLI

## Overview

`bin/memento.js` is the CLI entry point for operating and querying the memory server directly from the terminal, without a running server instance (for most commands).

```bash
node bin/memento.js <command> [options]
# or
npm run cli -- <command> [options]
```

All commands read environment variables from the `.env` file (`DATABASE_URL`, etc.). Load them before running:

```bash
export $(grep -v '^#' .env | grep '=' | xargs)
node bin/memento.js stats
```

---

## Command Reference

| Command | Description |
|---------|-------------|
| `serve` | Start the MCP server |
| `migrate` | Run DB migrations |
| `cleanup [--execute]` | Clean up noisy fragments (dry-run by default) |
| `backfill` | Backfill missing embeddings |
| `stats` | Fragment / anchor / topic statistics |
| `health` | DB / Redis / embedding connectivity diagnostics |
| `recall <query> [--topic x] [--limit n] [--time-range from,to]` | Terminal recall |
| `remember <content> --topic x --type fact` | Terminal remember |
| `inspect <id>` | Fragment detail + 1-hop links |
| `update [--execute] [--redetect]` | Check and apply updates (dry-run by default) |

All commands support `--json` for machine-readable output and `--verbose` for stack traces on error.

---

## Command Details

### serve

Start the MCP server in the foreground.

```bash
node bin/memento.js serve
# or
npm start
```

Set the `PORT` environment variable to override the default port (57332).

### migrate

Run all pending `lib/memory/migration-*.sql` files in order. Already-applied migrations are skipped.

```bash
node bin/memento.js migrate
# or
npm run migrate
```

Applied migrations are tracked in `agent_memory.schema_migrations`.

### cleanup

Delete noisy fragments that satisfy `util_score`, `importance`, and inactivity conditions.

```bash
node bin/memento.js cleanup            # dry-run (preview only)
node bin/memento.js cleanup --execute  # execute deletions
```

Alternative direct invocation:

```bash
node scripts/cleanup-noise.js --dry-run
node scripts/cleanup-noise.js --execute
```

### backfill

Generate embeddings for existing fragments that have none. Requires an embedding API key or a local transformers provider.

```bash
node bin/memento.js backfill
# or
npm run backfill:embeddings
```

### stats

Print fragment count, anchor count, and topic distribution.

```bash
node bin/memento.js stats
node bin/memento.js stats --json
```

### health

Diagnose DB connectivity, Redis status, and embedding provider availability.

```bash
node bin/memento.js health
```

### recall

Search fragments from the terminal. Works without a running server.

```bash
node bin/memento.js recall "search query"
node bin/memento.js recall "nginx error" --topic my-project --limit 5
node bin/memento.js recall "recent entries" --time-range 2026-01-01,2026-12-31
node bin/memento.js recall "query" --json
```

### remember

Store a fragment from the terminal.

```bash
node bin/memento.js remember "pg_hba.conf must be configured for remote connections" --topic infra --type fact
node bin/memento.js remember "deployment complete" --topic deploy-2026 --type procedure
```

### inspect

Print full metadata and 1-hop links for a fragment by ID.

```bash
node bin/memento.js inspect frag-00abc123
node bin/memento.js inspect frag-00abc123 --json
```

### update

Check for and optionally apply server updates.

```bash
node bin/memento.js update              # dry-run: check available updates
node bin/memento.js update --execute    # apply the update
node bin/memento.js update --redetect   # re-detect install type, then update
```

---

## npm Script Reference

| Script | What it runs |
|--------|-------------|
| `npm start` | `node server.js` (start server) |
| `npm run cli -- <args>` | `node bin/memento.js <args>` |
| `npm run migrate` | `node scripts/migrate.js` |
| `npm run backfill:embeddings` | `node scripts/backfill-embeddings.js` |
| `npm test` | Jest unit tests + node:test unit tests |
| `npm run test:integration` | Integration and E2E tests (all) |
| `npm run test:integration:llm` | LLM provider integration tests (sequential, v2.9.0) |

---

## Standalone Script Invocation

### Embedding Consistency Check

```bash
DATABASE_URL=$DATABASE_URL EMBEDDING_DIMENSIONS=1536 \
  node scripts/check-embedding-consistency.js
```

Verifies that the actual vector dimensions stored in `fragments` and `morpheme_dict` match the `EMBEDDING_DIMENSIONS` setting. Prints `PASS` on success or `FAIL` with remediation guidance on mismatch.

### Vector Dimension Migration (re-run migration-007)

Run after switching embedding providers or changing `EMBEDDING_DIMENSIONS`.

```bash
EMBEDDING_DIMENSIONS=384 DATABASE_URL=$DATABASE_URL \
  node scripts/migration-007-flexible-embedding-dims.js
```

Updates the vector column dimensions in both `fragments` and `morpheme_dict` simultaneously.

### Embedding Backfill

Re-generate embeddings for fragments with missing or stale vectors.

```bash
node scripts/backfill-embeddings.js
```

### L2 Normalization

Normalize embedding vectors to unit length. Run once after switching providers.

```bash
DATABASE_URL=$DATABASE_URL node scripts/normalize-vectors.js
```
