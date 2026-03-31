/**
 * MemoryConsolidator stage 계측 단위 테스트
 *
 * 작성자: 최진호
 * 작성일: 2026-03-31
 *
 * consolidate()가 stages 배열을 반환하며 각 스테이지 항목의
 * 필수 속성(name, durationMs, affected, status)을 검증한다.
 * 실제 DB/Redis 연결 없이 순수 로직을 검증하기 위해 의존성을 모킹한다.
 */

import { jest } from "@jest/globals";

/** ── 의존성 모킹 ── */

jest.unstable_mockModule("../lib/tools/db.js", () => ({
  getPrimaryPool:        () => null,
  queryWithAgentVector:  jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));

jest.unstable_mockModule("../lib/redis.js", () => ({
  pushToQueue:  jest.fn().mockResolvedValue(undefined),
  redisClient:  null,
}));

jest.unstable_mockModule("../lib/logger.js", () => ({
  logInfo:  jest.fn(),
  logWarn:  jest.fn(),
  logError: jest.fn(),
  logDebug: jest.fn(),
}));

jest.unstable_mockModule("../../config/memory.js", () => ({
  MEMORY_CONFIG: { gc: { utilityThreshold: 0.15 }, dedup: {} },
}), { virtual: true });

jest.unstable_mockModule("../config/memory.js", () => ({
  MEMORY_CONFIG: { gc: { utilityThreshold: 0.15 }, dedup: {} },
}));

/** FragmentStore 모킹 */
jest.unstable_mockModule("../lib/memory/FragmentStore.js", () => ({
  FragmentStore: jest.fn().mockImplementation(() => ({
    decayImportance:  jest.fn().mockResolvedValue(undefined),
    deleteExpired:    jest.fn().mockResolvedValue(0),
    transitionTTL:    jest.fn().mockResolvedValue(undefined),
    delete:           jest.fn().mockResolvedValue(undefined),
    createLink:       jest.fn().mockResolvedValue(undefined),
  })),
}));

/** FragmentIndex 모킹 */
jest.unstable_mockModule("../lib/memory/FragmentIndex.js", () => ({
  getFragmentIndex: jest.fn().mockReturnValue({
    pruneKeywordIndexes: jest.fn().mockResolvedValue(undefined),
  }),
}));

/** EmbeddingWorker 모킹 */
jest.unstable_mockModule("../lib/memory/EmbeddingWorker.js", () => ({
  EmbeddingWorker: jest.fn().mockImplementation(() => ({
    processOrphanFragments: jest.fn().mockResolvedValue(0),
  })),
}));

/** ContradictionDetector 모킹 */
jest.unstable_mockModule("../lib/memory/ContradictionDetector.js", () => ({
  ContradictionDetector: jest.fn().mockImplementation(() => ({
    resetCheckedPairs:         jest.fn(),
    detectContradictions:      jest.fn().mockResolvedValue({ found: 0, nliResolved: 0, nliSkipped: 0 }),
    detectSupersessions:       jest.fn().mockResolvedValue(0),
    processPendingContradictions: jest.fn().mockResolvedValue(0),
  })),
}));

/** ConsolidatorGC 모킹 */
jest.unstable_mockModule("../lib/memory/ConsolidatorGC.js", () => ({
  ConsolidatorGC: jest.fn().mockImplementation(() => ({
    generateFeedbackReport: jest.fn().mockResolvedValue(false),
    collectStaleFragments:  jest.fn().mockResolvedValue([]),
    purgeStaleReflections:  jest.fn().mockResolvedValue(0),
    splitLongFragments:     jest.fn().mockResolvedValue(0),
    calibrateByFeedback:    jest.fn().mockResolvedValue(0),
    compressOldFragments:   jest.fn().mockResolvedValue(0),
    _gcSearchEvents:        jest.fn().mockResolvedValue(0),
  })),
}));

/** GraphLinker 동적 import 모킹 */
jest.unstable_mockModule("../lib/memory/GraphLinker.js", () => ({
  GraphLinker: jest.fn().mockImplementation(() => ({
    retroLink: jest.fn().mockResolvedValue({ linksCreated: 0 }),
  })),
}));

/** ── 테스트 ── */

describe("MemoryConsolidator stage 계측", () => {
  let MemoryConsolidator;

  beforeAll(async () => {
    const mod = await import("../lib/memory/MemoryConsolidator.js");
    MemoryConsolidator = mod.MemoryConsolidator;
  });

  it("consolidate()가 stages 배열을 포함하는 객체를 반환한다", async () => {
    const consolidator = new MemoryConsolidator();
    const result       = await consolidator.consolidate();

    expect(result).toHaveProperty("stages");
    expect(Array.isArray(result.stages)).toBe(true);
    expect(result.stages.length).toBeGreaterThan(0);
  });

  it("각 스테이지 항목은 name, durationMs, affected, status 속성을 갖는다", async () => {
    const consolidator = new MemoryConsolidator();
    const { stages }   = await consolidator.consolidate();

    for (const stage of stages) {
      expect(stage).toHaveProperty("name");
      expect(typeof stage.name).toBe("string");
      expect(stage.name.length).toBeGreaterThan(0);

      expect(stage).toHaveProperty("durationMs");
      expect(typeof stage.durationMs).toBe("number");

      expect(stage).toHaveProperty("affected");
      expect(typeof stage.affected).toBe("number");

      expect(stage).toHaveProperty("status");
      expect(["ok", "error"]).toContain(stage.status);
    }
  });

  it("durationMs는 0 이상의 정수여야 한다", async () => {
    const consolidator = new MemoryConsolidator();
    const { stages }   = await consolidator.consolidate();

    for (const stage of stages) {
      expect(stage.durationMs).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(stage.durationMs)).toBe(true);
    }
  });

  it("정상 실행 시 status가 'ok'인 스테이지가 하나 이상 존재한다", async () => {
    const consolidator = new MemoryConsolidator();
    const { stages }   = await consolidator.consolidate();

    const okStages = stages.filter(s => s.status === "ok");
    expect(okStages.length).toBeGreaterThan(0);
  });

  it("기존 results 필드들이 여전히 반환된다 (하위 호환 보장)", async () => {
    const consolidator = new MemoryConsolidator();
    const result       = await consolidator.consolidate();

    expect(result).toHaveProperty("ttlTransitions");
    expect(result).toHaveProperty("expiredDeleted");
    expect(result).toHaveProperty("duplicatesMerged");
    expect(result).toHaveProperty("importanceDecay");
  });
});
