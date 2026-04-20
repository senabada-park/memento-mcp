# maintenance

작성자: 최진호
작성일: 2026-04-19

운영 중 필요에 따라 실행하는 유지보수 스크립트 목록이다. 각 스크립트의 목적, 선행 조건, 실행 명령, 권장 빈도를 기술한다.

---

## backfill-embeddings

### 목적

`agent_memory.fragments` 테이블에서 `embedding IS NULL`인 파편에 임베딩 벡터를 일괄 생성한다. `EMBEDDING_PROVIDER` 변경 후 기존 임베딩과의 차원 불일치를 해소하거나, 임베딩 API 장애 중 저장된 파편을 사후 처리할 때 사용한다.

중요: OpenAI 계열 임베딩과 로컬 transformers 임베딩은 차원이 다르므로 혼합할 수 없다. provider를 전환한 경우에는 기존 파편 전체를 재생성해야 한다. 서버 기동 시 `scripts/check-embedding-consistency.js`가 차원 불일치를 감지하면 기동을 거부하므로 반드시 backfill 완료 후 재시작한다.

### 선행 조건

- `DATABASE_URL` 환경변수 설정
- `EMBEDDING_API_KEY`(또는 `OPENAI_API_KEY`) 또는 `EMBEDDING_PROVIDER=transformers` 설정
- 대상 파편 수가 많을 경우 외부 임베딩 API rate limit 감안

### 실행 명령

```bash
DATABASE_URL=postgresql://... npm run backfill:embeddings
# 또는 직접 실행
DATABASE_URL=postgresql://... node scripts/backfill-embeddings.js
```

배치 크기 10, 배치 간격 500ms로 고정 실행된다. 진행 상황은 stdout의 `Embedded: N (failed: F)` 카운터로 확인한다.

### 권장 빈도

`EMBEDDING_PROVIDER` 변경 시 1회. 임베딩 API 장애 복구 후 누락 파편이 있을 경우 조건부 실행.

---

## cleanup-noise

### 목적

`agent_memory.fragments`에서 저품질 파편 3가지 범주를 탐지하고 삭제한다.

- 초단문: `content` 길이 < 10자, `access_count` <= 1, `is_anchor IS NOT TRUE`
- 빈 세션 요약: `type = 'fact'`, `content LIKE '%파편 0개 처리%'`, `importance < 0.3`
- NLI 재귀 쓰레기: `content LIKE '[모순 해결]%'`, `access_count <= 1`, `importance < 0.3` (`--include-nli` 지정 시에만 처리)

기본 실행은 `--dry-run` 모드로 삭제 대상 수와 샘플만 출력한다.

### 선행 조건

- `DATABASE_URL` 환경변수 설정
- 실제 삭제 전 `--dry-run`으로 대상 규모 확인 필수

### 실행 명령

```bash
# 대상 미리보기 (삭제하지 않음)
DATABASE_URL=postgresql://... node scripts/cleanup-noise.js --dry-run

# NLI 쓰레기 포함 미리보기
DATABASE_URL=postgresql://... node scripts/cleanup-noise.js --dry-run --include-nli

# 실제 삭제
DATABASE_URL=postgresql://... node scripts/cleanup-noise.js --execute

# NLI 쓰레기까지 포함하여 삭제
DATABASE_URL=postgresql://... node scripts/cleanup-noise.js --execute --include-nli
```

### 권장 빈도

조건부. 노이즈 파편이 recall 품질이나 context 토큰 예산에 영향을 준다고 판단될 때 1회성 실행. 정기 실행이 필요하면 월 1회를 기준으로 한다.

---

## benchmark-hot-path

### 목적

`remember`, `recall`, `link`, `reflect` 4개 hot path의 p50/p95/p99 latency를 측정하고 결과를 JSON으로 저장한다. Symbolic Memory 계층 도입 전후 회귀 기준선 확보를 위해 설계되었으며, 결과는 `scripts/baseline-v27.json`에 저장된다.

### 선행 조건

- `DATABASE_URL` 환경변수 설정 (테스트 DB 전용. 프로덕션 DB 사용 금지)
- baseline 확보 시 `MEMENTO_SYMBOLIC_ENABLED=false`(기본값) 상태로 실행

### 실행 명령

```bash
# 기본 실행 (각 100/100/100/10회)
DATABASE_URL=postgresql://... node scripts/benchmark-hot-path.js

# 반복 횟수 및 출력 경로 지정
DATABASE_URL=postgresql://... node scripts/benchmark-hot-path.js \
  --remember 200 --recall 200 \
  --output scripts/baseline-custom.json

# Symbolic 계층 활성화 후 비교 측정
MEMENTO_SYMBOLIC_ENABLED=true \
DATABASE_URL=postgresql://... node scripts/benchmark-hot-path.js \
  --output scripts/baseline-symbolic.json
```

출력 JSON 형식: `{ runAt, gitSha, remember, recall, link, reflect }`. 각 항목은 `{ p50, p95, p99, n }` 구조다.

### 권장 빈도

조건부. Symbolic Memory feature flag 전환 전후에 실행하여 오버헤드를 비교한다.

---

## backfill-claims

### 목적

v2.8.0 이전에 저장된 파편(기존 코퍼스)에 `ClaimExtractor`를 소급 실행하여 `fragment_claims` 테이블을 채운다. v2.8.0 이후 신규 파편은 `RememberPostProcessor` 8단계 hook에서 실시간 추출되므로, 이 스크립트는 기존 코퍼스 전용이다.

자세한 실행 가이드는 `docs/operations/backfill-claims.md`를 참조한다.

### 선행 조건

- `DATABASE_URL` 환경변수 설정
- ClaimExtractor가 의존하는 임베딩 API(`OPENAI_API_KEY` 등) 또는 로컬 transformers provider 설정
- 실행 전 `--dry-run`으로 추출 볼륨 및 `tenant_violations` 수치 확인 필수

### 실행 명령

```bash
# 볼륨 사전 확인 (dry run)
DATABASE_URL=postgresql://... node scripts/backfill-claims.js --dry-run --verbose --limit 100

# 전체 실행
DATABASE_URL=postgresql://... node scripts/backfill-claims.js \
  --batch-size 500 --rate-limit-ms 200

# 특정 테넌트만 처리
DATABASE_URL=postgresql://... node scripts/backfill-claims.js \
  --tenant-key mmcp_xxx --dry-run --verbose
```

### 권장 빈도

일회성. Phase 1 Shadow 활성화(`MEMENTO_SYMBOLIC_SHADOW=true`) 전 1회 실행.

---

## test-llm-callers

### 목적

`AutoReflect`, `ConsolidatorGC`, `ContradictionDetector`(2종), `MemoryEvaluator` 5개 LLM caller가 외부 LLM으로부터 기대하는 JSON 스키마를 올바르게 수신하는지 E2E로 검증한다. LLM provider 교체 또는 프롬프트 수정 후 회귀 확인 용도다.

### 선행 조건

- `LLM_PRIMARY`, `LLM_FALLBACKS` 환경변수 설정
- `POSTGRES_*`, `REDIS_*`, `OPENAI_API_KEY`, `LOG_DIR` 환경변수 설정
- 외부 LLM 엔드포인트(Gemini CLI, Ollama Cloud 등)가 네트워크 접근 가능 상태

### 실행 명령

```bash
# gemini-cli 우선 실행
node scripts/test-llm-callers.mjs

# Ollama Cloud fallback 강제 (gemini-cli PATH 차단)
PATH="/usr/bin:/bin" node scripts/test-llm-callers.mjs
```

종료 코드: 모든 케이스 통과 시 0, 하나라도 실패 시 1. stdout에 `PASS N/5  FAIL M/5` 요약을 출력한다.

### 권장 빈도

조건부. LLM provider 변경 또는 caller 프롬프트 수정 후 실행.
