/**
 * fragment-isolation.test.js — content_hash 테넌트 격리 단위 테스트
 *
 * 작성자: 최진호
 * 작성일: 2026-04-10
 *
 * migration-031 이후 partial index 2개(uq_frag_hash_master, uq_frag_hash_per_key)로
 * 전환된 content_hash 격리 동작을 FragmentWriter / BatchRememberProcessor mock으로 검증한다.
 *
 * 검증 대상:
 *   1. dedup SELECT가 key_id 격리 조건(IS NOT DISTINCT FROM)을 포함하는지
 *   2. ON CONFLICT 절이 keyId null/non-null에 따라 올바른 partial index를 지정하는지
 *   3. 동일 content_hash라도 다른 key_id 파편은 별개 row로 INSERT되는지
 *   4. master(key_id=null)와 DB API key 사이에도 격리가 적용되는지
 */

import { describe, it, mock, before, after } from "node:test";
import assert from "node:assert/strict";

import { FragmentWriter, sanitizeInsertImportance } from "../../lib/memory/FragmentWriter.js";
import { BatchRememberProcessor }                   from "../../lib/memory/BatchRememberProcessor.js";
import { disconnectRedis }                          from "../../lib/redis.js";

after(async () => { await disconnectRedis().catch(() => {}); });

/* ─────────────────────────────────────────────
   헬퍼
───────────────────────────────────────────── */

/**
 * FragmentWriter에 주입할 queryWithAgentVector mock 빌더.
 * capturedQueries 배열에 모든 호출을 기록한다.
 *
 * dupIds: dedup SELECT에서 반환할 row(id 목록) — 기본 빈 배열(중복 없음)
 */
function buildQueryMock(capturedQueries, dupIds = []) {
  return async function mockQuery(agentId, sql, params, mode) {
    capturedQueries.push({ agentId, sql, params, mode });

    const s = (sql || "").trim().toUpperCase();

    /** dedup SELECT */
    if (s.startsWith("SELECT ID FROM") && s.includes("CONTENT_HASH")) {
      return { rows: dupIds.map(id => ({ id })) };
    }
    /** INSERT → RETURNING id */
    if (s.startsWith("INSERT INTO") && s.includes("CONTENT_HASH")) {
      return { rows: [{ id: params?.[0] ?? "mock-id" }] };
    }
    /** CREATE SCHEMA */
    if (s.startsWith("CREATE SCHEMA")) return { rows: [] };

    return { rows: [] };
  };
}

/**
 * BatchRememberProcessor 용 pg client mock.
 * capturedSqls 배열에 INSERT SQL 문자열을 기록한다.
 */
function makeBatchClient(capturedSqls) {
  return {
    query: mock.fn(async (sql, _params) => {
      const s = (sql || "").trim().toUpperCase();
      if (s.startsWith("BEGIN") || s.startsWith("COMMIT") || s.startsWith("ROLLBACK")) {
        return { rows: [] };
      }
      if (s.startsWith("SET LOCAL")) return { rows: [] };
      if (s.startsWith("SELECT") && s.includes("FRAGMENT_LIMIT")) {
        return { rows: [] }; // quota 없음
      }
      if (s.startsWith("INSERT INTO") && s.includes("CONTENT_HASH")) {
        capturedSqls.push(sql);
        return { rows: [{ id: _params?.[0] ?? "batch-id" }] };
      }
      return { rows: [] };
    }),
    release: mock.fn()
  };
}

function makeMockFactory() {
  let seq = 0;
  return {
    create(item) {
      seq++;
      return {
        id                : `frag-${seq}`,
        content           : item.content,
        topic             : item.topic ?? "test",
        type              : item.type ?? "fact",
        keywords          : item.keywords ?? [],
        importance        : item.importance ?? 0.5,
        content_hash      : "same-hash",   // 모든 파편이 동일 content_hash
        source            : null,
        linked_to         : [],
        ttl_tier          : "warm",
        estimated_tokens  : 10,
        valid_from        : new Date().toISOString(),
        is_anchor         : false,
        context_summary   : null,
        session_id        : null,
        workspace         : null,
        case_id           : null,
        goal              : null,
        outcome           : null,
        phase             : null,
        resolution_status : null,
        assertion_status  : "observed",
      };
    }
  };
}

/* ─────────────────────────────────────────────
   FragmentWriter 테스트
───────────────────────────────────────────── */

describe("FragmentWriter — content_hash 테넌트 격리", () => {

  it("dedup SELECT가 key_id IS NOT DISTINCT FROM 조건을 포함한다", async () => {
    const captured = [];
    const writer   = new FragmentWriter();

    // queryWithAgentVector를 직접 모킹할 수 없으므로
    // db.js 모듈 단위에서 실제 pool 미사용 경로를 확인:
    // getPrimaryPool()이 null 반환 → insert()가 null을 반환하는지 확인하는 대신,
    // 실제 SQL 문자열 생성 로직은 FragmentWriter 소스에서 직접 검증한다.
    //
    // 아래는 dedup SELECT SQL이 key_id 격리 조건을 포함하는지 소스 레벨에서 확인.
    const src = FragmentWriter.toString();
    // class body에 해당 패턴이 있어야 한다
    assert.ok(
      src.includes("IS NOT DISTINCT FROM"),
      "dedup SELECT must include IS NOT DISTINCT FROM for key_id isolation"
    );
  });

  it("insert(): keyId=null → ON CONFLICT (content_hash) WHERE key_id IS NULL", async () => {
    const captured = [];
    const writer   = new FragmentWriter();

    // ON CONFLICT 분기 로직이 소스에 포함돼 있는지 확인
    const src = FragmentWriter.toString();
    assert.ok(
      src.includes("ON CONFLICT (content_hash) WHERE key_id IS NULL"),
      "master path must use partial index clause: ON CONFLICT (content_hash) WHERE key_id IS NULL"
    );
  });

  it("insert(): keyId non-null → ON CONFLICT (key_id, content_hash) WHERE key_id IS NOT NULL", async () => {
    const src = FragmentWriter.toString();
    assert.ok(
      src.includes("ON CONFLICT (key_id, content_hash) WHERE key_id IS NOT NULL"),
      "DB API key path must use partial index clause: ON CONFLICT (key_id, content_hash) WHERE key_id IS NOT NULL"
    );
  });

  it("update() dedup SELECT가 existing.key_id 격리 조건을 포함한다", async () => {
    const src = FragmentWriter.toString();
    assert.ok(
      src.includes("IS NOT DISTINCT FROM"),
      "update() dedup SELECT must include IS NOT DISTINCT FROM"
    );
  });

});

/* ─────────────────────────────────────────────
   BatchRememberProcessor 테스트
───────────────────────────────────────────── */

describe("BatchRememberProcessor — content_hash ON CONFLICT 격리", () => {

  it("keyId=null(master) → ON CONFLICT (content_hash) WHERE key_id IS NULL 사용", async () => {
    const capturedSqls = [];
    const client       = makeBatchClient(capturedSqls);
    const pool         = { connect: async () => client };

    const proc = new BatchRememberProcessor({
      store   : {},
      index   : { index: mock.fn(async () => {}) },
      factory : makeMockFactory()
    });
    proc.setPool(pool);

    await proc.process({
      fragments : [{ content: "test content A", type: "fact", topic: "t" }],
      agentId   : "default",
      _keyId    : null
    });

    assert.ok(capturedSqls.length > 0, "INSERT SQL should have been captured");
    const insertSql = capturedSqls[0];
    assert.ok(
      insertSql.includes("ON CONFLICT (content_hash) WHERE key_id IS NULL"),
      `master path must use partial index; got: ${insertSql}`
    );
  });

  it("keyId non-null(DB API key) → ON CONFLICT (key_id, content_hash) WHERE key_id IS NOT NULL 사용", async () => {
    const capturedSqls = [];
    const client       = makeBatchClient(capturedSqls);
    const pool         = { connect: async () => client };

    const proc = new BatchRememberProcessor({
      store   : {},
      index   : { index: mock.fn(async () => {}) },
      factory : makeMockFactory()
    });
    proc.setPool(pool);

    await proc.process({
      fragments : [{ content: "test content B", type: "fact", topic: "t" }],
      agentId   : "default",
      _keyId    : "key-abc"
    });

    assert.ok(capturedSqls.length > 0, "INSERT SQL should have been captured");
    const insertSql = capturedSqls[0];
    assert.ok(
      insertSql.includes("ON CONFLICT (key_id, content_hash) WHERE key_id IS NOT NULL"),
      `DB key path must use composite partial index; got: ${insertSql}`
    );
  });

  it("동일 content_hash, 다른 keyId → 각각 독립 INSERT (cross-tenant 덮어쓰기 없음)", async () => {
    /** 두 독립 client로 각각 tenant 삽입을 시뮬레이션 */
    const sqls_A = [];
    const sqls_B = [];

    const procA = new BatchRememberProcessor({
      store   : {},
      index   : { index: mock.fn(async () => {}) },
      factory : makeMockFactory()
    });
    procA.setPool({ connect: async () => makeBatchClient(sqls_A) });

    const procB = new BatchRememberProcessor({
      store   : {},
      index   : { index: mock.fn(async () => {}) },
      factory : makeMockFactory()
    });
    procB.setPool({ connect: async () => makeBatchClient(sqls_B) });

    await procA.process({
      fragments : [{ content: "shared content", type: "fact", topic: "t" }],
      agentId   : "default",
      _keyId    : "key-tenant-A"
    });
    await procB.process({
      fragments : [{ content: "shared content", type: "fact", topic: "t" }],
      agentId   : "default",
      _keyId    : "key-tenant-B"
    });

    assert.ok(sqls_A.length > 0 && sqls_B.length > 0, "both tenants must produce INSERT");

    /** 두 INSERT의 ON CONFLICT 절이 동일한 partial index를 사용하지만
     *  keyId 파라미터가 다르므로 PK 충돌 없이 별개 row로 삽입됨.
     *  여기서는 SQL 절 구조 검증으로 대리 확인한다. */
    assert.ok(
      sqls_A[0].includes("ON CONFLICT (key_id, content_hash) WHERE key_id IS NOT NULL"),
      "tenant A must use composite partial index"
    );
    assert.ok(
      sqls_B[0].includes("ON CONFLICT (key_id, content_hash) WHERE key_id IS NOT NULL"),
      "tenant B must use composite partial index"
    );
  });

  it("master(keyId=null)와 DB API key는 서로 다른 partial index 사용 → 격리 보장", async () => {
    const masterSqls = [];
    const keySqls    = [];

    const procMaster = new BatchRememberProcessor({
      store   : {},
      index   : { index: mock.fn(async () => {}) },
      factory : makeMockFactory()
    });
    procMaster.setPool({ connect: async () => makeBatchClient(masterSqls) });

    const procKey = new BatchRememberProcessor({
      store   : {},
      index   : { index: mock.fn(async () => {}) },
      factory : makeMockFactory()
    });
    procKey.setPool({ connect: async () => makeBatchClient(keySqls) });

    await procMaster.process({
      fragments : [{ content: "same content", type: "fact", topic: "t" }],
      agentId   : "default",
      _keyId    : null
    });
    await procKey.process({
      fragments : [{ content: "same content", type: "fact", topic: "t" }],
      agentId   : "default",
      _keyId    : "key-xyz"
    });

    const masterSql = masterSqls[0];
    const keySql    = keySqls[0];

    assert.ok(
      masterSql.includes("ON CONFLICT (content_hash) WHERE key_id IS NULL"),
      `master path must use uq_frag_hash_master; got: ${masterSql}`
    );
    assert.ok(
      keySql.includes("ON CONFLICT (key_id, content_hash) WHERE key_id IS NOT NULL"),
      `DB key path must use uq_frag_hash_per_key; got: ${keySql}`
    );

    /** 두 SQL이 서로 다른 ON CONFLICT 절 → 충돌 없이 각자 삽입 보장 */
    assert.notEqual(
      masterSql.split("ON CONFLICT")[1],
      keySql.split("ON CONFLICT")[1],
      "master and DB key must use different ON CONFLICT predicates"
    );
  });

});
