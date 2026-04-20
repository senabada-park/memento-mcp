-- migration-036-fragment-idempotency.sql
-- 작성자: 최진호
-- 작성일: 2026-04-20
-- 목적: fragments.idempotency_key 컬럼 추가 및 테넌트별 유일성 인덱스 생성
--       클라이언트 재시도 시 중복 파편 생성을 방지한다.
--
-- 인덱스 설계 (partial unique index 2개):
--   idx_fragments_idempotency_tenant : DB API key(key_id IS NOT NULL) 범위 복합 유일성
--   idx_fragments_idempotency_master : master(key_id IS NULL) 범위 단독 유일성
--
-- 주의: CREATE INDEX CONCURRENTLY는 트랜잭션 내 실행 불가.
--   migration runner(scripts/migrate.js)가 BEGIN/COMMIT으로 감싸므로
--   일반 CREATE UNIQUE INDEX를 사용한다.
--   프로덕션에서 잠금 최소화가 필요하다면 migrate.js 실행 전 아래 문을
--   수동으로 CONCURRENTLY 옵션으로 별도 실행하고, 이 파일은 IF NOT EXISTS 가드로
--   안전하게 SKIP된다.
--
-- 멱등: IF NOT EXISTS 가드 사용

BEGIN;

-- 1) idempotency_key 컬럼 추가
ALTER TABLE agent_memory.fragments
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT NULL;

-- 2-a) DB API key(key_id IS NOT NULL) 전용 복합 partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_fragments_idempotency_tenant
  ON agent_memory.fragments (key_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND key_id IS NOT NULL;

-- 2-b) master(key_id IS NULL) 전용 partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_fragments_idempotency_master
  ON agent_memory.fragments (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND key_id IS NULL;

COMMIT;
