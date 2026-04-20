# Contributing to Memento MCP

## Development Setup

1. Clone the repository
2. `cp .env.example .env` and configure
3. Start PostgreSQL with pgvector: `docker-compose -f docker-compose.test.yml up -d`
4. `npm install`
5. `npm run migrate`
6. `npm test`

### Full Development Stack

For a complete local environment with PostgreSQL + Redis:

```bash
docker-compose -f docker-compose.dev.yml up -d
cp .env.example .env  # Edit DB credentials to match dev compose
npm install
npm run migrate
node server.js
```

### Docker Build

```bash
docker build -t memento-mcp .
```

## Code Style

- ESM imports only (no require)
- All SQL queries use parameterized binding ($1, $2)
- Error logging via Winston (logInfo, logWarn, logError from lib/logger.js)
- Variables: const by default, let when mutation needed

## Architecture: lib/memory/processors/

`lib/memory/processors/` 디렉토리는 v2.10.0(Phase 5-B)에서 MemoryManager를 1252줄에서 259줄 facade로 축소하면서 신설됐다. MemoryRememberer / MemoryRecaller / MemoryReflector / MemoryLinker 4개 클래스가 책임별로 분리되어 있다.

- MemoryRememberer: `remember` / `batchRemember`
- MemoryRecaller: `recall` / `context`
- MemoryReflector: `reflect`
- MemoryLinker: `link` / `graph_explore`

facade와 프로세서 간 공유 프로퍼티(embedder, fragmentStore 등)는 `_installSharedSync` 패턴으로 동기화된다. 외부에서 facade의 세터를 호출하면 모든 프로세서에 자동 전파되므로 외부 인터페이스는 변경이 없다.

테스트에서 메서드 본문을 검증할 때는 `MemoryManager.prototype.remember.toString()` 대신 `MemoryRememberer.prototype.remember.toString()`을 사용한다.

## Testing

- Unit tests: `tests/unit/` (node:test runner)
- E2E tests: `tests/e2e/` (requires PostgreSQL)
- Jest tests: `tests/*.test.js` (root level)
- Integration tests: `tests/integration/` — 통합 테스트 (node:test runner + Jest integration project)
  - Jest integration project picks up `tests/integration/**/*.jest.test.js`
  - `npm run test:integration` runs integration and e2e tests via node:test
- Run all: `npm test`

## Pull Request Checklist

- [ ] `npm test` passes (0 failures)
- [ ] `npx eslint . --max-warnings 0` passes
- [ ] New migration file if DB schema changed
- [ ] CHANGELOG.md updated
- [ ] SKILL.md updated if tool parameters changed

## Commit Messages

Format: `type: description`
Types: feat, fix, docs, chore, refactor, test
