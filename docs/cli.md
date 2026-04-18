# CLI

## 개요

`bin/memento.js`는 서버 없이 터미널에서 메모리 서버를 운영·조회할 수 있는 CLI 진입점이다.

```bash
node bin/memento.js <command> [options]
# 또는
npm run cli -- <command> [options]
```

모든 명령은 `.env` 파일의 `DATABASE_URL` 등 환경변수를 읽는다. 실행 전 환경변수를 로드한다.

```bash
# 환경변수 로드 후 실행 예시
export $(grep -v '^#' .env | grep '=' | xargs)
node bin/memento.js stats
```

---

## 명령어 목록

| 커맨드 | 설명 |
|--------|------|
| `serve` | MCP 서버 시작 |
| `migrate` | DB 마이그레이션 실행 |
| `cleanup [--execute]` | 노이즈 파편 정리 (기본 dry-run) |
| `backfill` | 누락된 임베딩 백필 |
| `stats` | 파편/앵커/토픽 통계 |
| `health` | DB/Redis/임베딩 연결 진단 |
| `recall <query> [--topic x] [--limit n] [--time-range from,to]` | 터미널 recall |
| `remember <content> --topic x --type fact` | 터미널 remember |
| `inspect <id>` | 파편 상세 + 1-hop 링크 |
| `update [--execute] [--redetect]` | 업데이트 확인 및 적용 (기본 dry-run) |

모든 명령은 `--json` 플래그로 JSON 출력 지원. `--verbose` 플래그로 스택 트레이스 출력.

---

## 명령어 상세

### serve

MCP 서버를 포그라운드로 시작한다.

```bash
node bin/memento.js serve
# 또는
npm start
```

`PORT` 환경변수로 포트 지정 (기본: 57332).

### migrate

`lib/memory/migration-*.sql` 파일을 순서대로 실행한다. 이미 적용된 마이그레이션은 건너뛴다.

```bash
node bin/memento.js migrate
# 또는
npm run migrate
```

적용 이력은 `agent_memory.schema_migrations` 테이블에 기록된다.

### cleanup

`util_score`, `importance`, 비활성 기간 조건을 만족하는 노이즈 파편을 삭제한다.

```bash
node bin/memento.js cleanup           # dry-run (미리보기만)
node bin/memento.js cleanup --execute  # 실제 삭제 실행
```

직접 실행 대안:

```bash
node scripts/cleanup-noise.js --dry-run
node scripts/cleanup-noise.js --execute
```

### backfill

임베딩이 없는 기존 파편에 임베딩을 생성한다. 임베딩 API 키 또는 로컬 transformers provider가 필요하다.

```bash
node bin/memento.js backfill
# 또는
npm run backfill:embeddings
```

### stats

파편 수, 앵커 수, 토픽별 분포 등 현황을 출력한다.

```bash
node bin/memento.js stats
node bin/memento.js stats --json
```

### health

DB 연결, Redis 상태, 임베딩 provider 동작 여부를 진단한다.

```bash
node bin/memento.js health
```

### recall

터미널에서 파편 검색을 실행한다. 서버가 실행 중이지 않아도 동작한다.

```bash
node bin/memento.js recall "검색어"
node bin/memento.js recall "nginx 에러" --topic my-project --limit 5
node bin/memento.js recall "2026-01-01 이후 기록" --time-range 2026-01-01,2026-12-31
node bin/memento.js recall "검색어" --json
```

### remember

터미널에서 파편을 저장한다.

```bash
node bin/memento.js remember "PostgreSQL 연결 시 pg_hba.conf 설정 필요" --topic infra --type fact
node bin/memento.js remember "배포 완료" --topic deploy-2026 --type procedure
```

### inspect

파편 ID로 전체 메타데이터와 1-hop 링크를 출력한다.

```bash
node bin/memento.js inspect frag-00abc123
node bin/memento.js inspect frag-00abc123 --json
```

### update

서버 업데이트를 확인하고 선택적으로 적용한다.

```bash
node bin/memento.js update              # dry-run: 사용 가능한 업데이트 확인
node bin/memento.js update --execute    # 업데이트 적용
node bin/memento.js update --redetect   # 설치 방식 재탐지 후 업데이트
```

---

## npm 스크립트 연동

| 스크립트 | 실행 내용 |
|---------|---------|
| `npm start` | `node server.js` (서버 시작) |
| `npm run cli -- <args>` | `node bin/memento.js <args>` |
| `npm run migrate` | `node scripts/migrate.js` |
| `npm run backfill:embeddings` | `node scripts/backfill-embeddings.js` |
| `npm test` | Jest 단위 테스트 + node:test 단위 테스트 |
| `npm run test:integration` | 통합/E2E 테스트 일괄 실행 |
| `npm run test:integration:llm` | LLM provider 통합 테스트 순차 실행 (v2.9.0) |

---

## 스크립트 단독 실행

### 임베딩 일관성 검사

```bash
DATABASE_URL=$DATABASE_URL EMBEDDING_DIMENSIONS=1536 \
  node scripts/check-embedding-consistency.js
```

`fragments`와 `morpheme_dict` 두 테이블의 실제 벡터 차원이 `EMBEDDING_DIMENSIONS` 설정과 일치하는지 확인한다. 불일치 시 `FAIL`을 출력하고 `migration-007` 재실행 가이드를 제공한다.

### 벡터 차원 변경 (migration-007 재실행)

임베딩 제공자 변경 또는 `EMBEDDING_DIMENSIONS` 변경 후 실행한다.

```bash
EMBEDDING_DIMENSIONS=384 DATABASE_URL=$DATABASE_URL \
  node scripts/migration-007-flexible-embedding-dims.js
```

`fragments`와 `morpheme_dict` 테이블의 벡터 컬럼 차원을 동시에 갱신한다.

### 임베딩 백필

기존 파편의 임베딩이 없거나 차원이 변경된 경우 재생성한다.

```bash
node scripts/backfill-embeddings.js
```

### L2 정규화

임베딩 벡터를 L2 정규화한다. 제공자 전환 후 1회 실행하면 된다.

```bash
DATABASE_URL=$DATABASE_URL node scripts/normalize-vectors.js
```
