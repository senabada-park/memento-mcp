import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SessionLinker } from "../../lib/memory/SessionLinker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "../..");

describe("Tenant Isolation — key_id 격리 회귀 방지", () => {

  it("lib/ 내에 'key_id IS NULL OR key_id' 패턴이 없어야 함", () => {
    let matches = "";
    try {
      matches = execFileSync("grep", ["-rn", "key_id IS NULL OR key_id", "lib/"], {
        cwd:      ROOT,
        encoding: "utf-8"
      });
    } catch (e) {
      // grep exit code 1 = no match = 정상
      if (e.status === 1) return;
      throw e;
    }
    assert.equal(matches.trim(), "",
      `금지 패턴 발견:\n${matches}\n\n수정 방법: keyId가 null이면 조건 생략, 값이면 AND key_id = $N만 적용`);
  });

  it("lib/ 내에 'key_id' 대상 '::text IS NULL OR' 패턴이 없어야 함 (타입 불일치 방지)", () => {
    let matches = "";
    try {
      matches = execFileSync("grep", ["-rn", "::text IS NULL OR.*key_id", "lib/"], {
        cwd:      ROOT,
        encoding: "utf-8"
      });
    } catch (e) {
      if (e.status === 1) return;
      throw e;
    }
    assert.equal(matches.trim(), "",
      `타입 불일치 패턴 발견:\n${matches}`);
  });

});

describe("Tenant Isolation — key_id 조건 빌드 검증", () => {

  it("keyId=null (master)일 때 key_id 조건이 SQL에 포함되지 않아야 함", () => {
    const keyId = null;
    let sql      = "DELETE FROM fragments WHERE id = ANY($1)";
    if (keyId) {
      sql += " AND key_id = $2";
    }
    assert.ok(!sql.includes("key_id"), "마스터 키는 key_id 조건 없이 전체 접근");
  });

  it("keyId=5 (API key)일 때 key_id = $N 조건만 포함되어야 함", () => {
    const keyId = 5;
    let sql      = "DELETE FROM fragments WHERE id = ANY($1)";
    if (keyId) {
      sql += " AND key_id = $2";
    }
    assert.ok(sql.includes("key_id = $2"), "API 키는 key_id = $N 조건 필수");
    assert.ok(!sql.includes("IS NULL"), "IS NULL 조건 금지");
  });

  it("keyId=null일 때 patchAssertion 패턴이 조건 없이 동작", () => {
    const keyId  = null;
    const params = ["verified", "frag-123"];
    let keyFilter = "";
    if (keyId != null) {
      params.push(keyId);
      keyFilter = `AND key_id = $${params.length}`;
    }
    assert.equal(keyFilter, "");
    assert.equal(params.length, 2);
  });

  it("keyId=5일 때 patchAssertion 패턴이 key_id = $3 조건 포함", () => {
    const keyId  = 5;
    const params = ["verified", "frag-123"];
    let keyFilter = "";
    if (keyId != null) {
      params.push(keyId);
      keyFilter = `AND key_id = $${params.length}`;
    }
    assert.equal(keyFilter, "AND key_id = $3");
    assert.equal(params.length, 3);
    assert.equal(params[2], 5);
  });

});

describe("Tenant Isolation — SessionLinker.wouldCreateCycle keyId 격리", () => {

  /**
   * SessionLinker.wouldCreateCycle이 LinkStore.isReachable에 keyId를 4번째
   * 인자로 전파하는지 검증한다. v2.7.0에서 이 경로가 사각지대였고,
   * 다른 테넌트의 fragment를 경유한 cycle path가 탐지되는 보안 결함이었다.
   */

  const makeStore = () => ({
    isReachable: mock.fn(async () => false),
    createLink : mock.fn(async () => {})
  });

  it("wouldCreateCycle이 keyId를 4번째 인자로 isReachable에 전파해야 함 (tenant A)", async () => {
    const store = makeStore();
    const linker = new SessionLinker(store, null);

    await linker.wouldCreateCycle("X", "Y", "default", "tenant-A");

    assert.equal(store.isReachable.mock.callCount(), 1);
    const args = store.isReachable.mock.calls[0].arguments;
    assert.equal(args[0], "Y", "isReachable.startId = toId (역방향)");
    assert.equal(args[1], "X", "isReachable.targetId = fromId (역방향)");
    assert.equal(args[2], "default");
    assert.equal(args[3], "tenant-A", "keyId 4번째 인자로 전파되어야 함");
  });

  it("wouldCreateCycle이 keyId=null(master)이면 null을 전파해야 함 (backward compat)", async () => {
    const store = makeStore();
    const linker = new SessionLinker(store, null);

    await linker.wouldCreateCycle("X", "Y", "default");

    assert.equal(store.isReachable.mock.callCount(), 1);
    const args = store.isReachable.mock.calls[0].arguments;
    assert.equal(args[3], null, "keyId 생략 시 null 기본값");
  });

  it("wouldCreateCycle이 다른 tenant의 keyId를 섞어 호출하지 않아야 함", async () => {
    const store = makeStore();
    const linker = new SessionLinker(store, null);

    await linker.wouldCreateCycle("X", "Y", "default", "tenant-A");
    await linker.wouldCreateCycle("P", "Q", "default", "tenant-B");

    assert.equal(store.isReachable.mock.callCount(), 2);
    assert.equal(store.isReachable.mock.calls[0].arguments[3], "tenant-A");
    assert.equal(store.isReachable.mock.calls[1].arguments[3], "tenant-B");
  });

  it("autoLinkSessionFragments가 wouldCreateCycle 경로에 keyId를 전파해야 함", async () => {
    const store = makeStore();
    const linker = new SessionLinker(store, null);

    const fragments = [
      { id: "e1", type: "error" },
      { id: "d1", type: "decision" },
      { id: "p1", type: "procedure" }
    ];

    await linker.autoLinkSessionFragments(fragments, "default", "tenant-A");

    assert.ok(store.isReachable.mock.callCount() >= 2, "error+decision / procedure+error 쌍 cycle 검증 수행");
    for (const call of store.isReachable.mock.calls) {
      assert.equal(call.arguments[3], "tenant-A",
        "모든 isReachable 호출은 동일 tenant keyId를 전파해야 함 (cross-tenant leak 차단)");
    }
  });

  it("autoLinkSessionFragments keyId 미전달 시 master(null)로 동작 (backward compat)", async () => {
    const store = makeStore();
    const linker = new SessionLinker(store, null);

    const fragments = [
      { id: "e1", type: "error" },
      { id: "d1", type: "decision" }
    ];

    await linker.autoLinkSessionFragments(fragments, "default");

    assert.equal(store.isReachable.mock.callCount(), 1);
    assert.equal(store.isReachable.mock.calls[0].arguments[3], null);
  });

  it("isReachable이 throw하면 wouldCreateCycle은 false 반환 (보수적 차단 해제)", async () => {
    const store = {
      isReachable: mock.fn(async () => { throw new Error("db error"); }),
      createLink : mock.fn(async () => {})
    };
    const linker = new SessionLinker(store, null);

    const result = await linker.wouldCreateCycle("X", "Y", "default", "tenant-A");

    assert.equal(result, false, "에러 시 cycle 없음으로 판단 (기존 동작 유지)");
  });

});
