/**
 * L1 miss 메트릭 분류 단위 테스트
 *
 * 작성자: 최진호
 * 작성일: 2026-03-31
 *
 * text-only 쿼리가 L1 폴백으로 계산되지 않는지 검증한다.
 * keywords를 가진 쿼리에서 Redis가 빈 결과를 반환하면 L1 폴백으로 계산되어야 한다.
 */

import { FragmentSearch } from "../lib/memory/FragmentSearch.js";

// ---------------------------------------------------------------------------
// _searchL1 직접 접근을 위한 헬퍼
// ---------------------------------------------------------------------------

/**
 * FragmentSearch._searchL1()의 isFallback 결과만 추출한다.
 * Redis/DB 의존성을 모킹하여 순수하게 폴백 분류 로직만 테스트한다.
 */
async function getL1FallbackFlag(query, redisHasResults = false) {
  const search = new FragmentSearch();

  /** Redis 인덱스 메서드를 모킹 — 결과 반환 여부만 제어한다 */
  search.index.searchByKeywords = async () => redisHasResults ? ["frag-1"] : [];
  search.index.searchByTopic    = async () => redisHasResults ? ["frag-1"] : [];
  search.index.searchByType     = async () => redisHasResults ? ["frag-1"] : [];
  search.index.getRecent        = async () => ["frag-recent-1", "frag-recent-2"];

  const result = await search._searchL1(query, null);
  return result.isFallback;
}

// ---------------------------------------------------------------------------
// text-only 쿼리: L1 폴백 아님
// ---------------------------------------------------------------------------

describe("L1 miss 메트릭 — text-only 쿼리", () => {
  it("text만 있는 쿼리는 isFallback: false여야 한다", async () => {
    const isFallback = await getL1FallbackFlag({ text: "어제 한 결정이 뭐였지?" });
    expect(isFallback).toBe(false);
  });

  it("text + tokenBudget 조합도 isFallback: false여야 한다", async () => {
    const isFallback = await getL1FallbackFlag({ text: "배포 절차", tokenBudget: 2000 });
    expect(isFallback).toBe(false);
  });

  it("text-only 쿼리는 빈 ids를 반환해야 한다 (L2/L3에 위임)", async () => {
    const search = new FragmentSearch();
    search.index.searchByKeywords = async () => [];
    search.index.searchByTopic    = async () => [];
    search.index.searchByType     = async () => [];
    search.index.getRecent        = async () => ["frag-recent"];

    const result = await search._searchL1({ text: "어제 한 결정" }, null);
    expect(result.ids).toHaveLength(0);
    expect(result.isFallback).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// keywords 쿼리: Redis miss → isFallback: true
// ---------------------------------------------------------------------------

describe("L1 miss 메트릭 — keywords 쿼리", () => {
  it("keywords가 있지만 Redis 결과가 없으면 isFallback: true여야 한다", async () => {
    const isFallback = await getL1FallbackFlag(
      { keywords: ["배포", "절차"] },
      false  // Redis 빈 결과
    );
    expect(isFallback).toBe(true);
  });

  it("keywords가 있고 Redis 결과가 있으면 isFallback: false여야 한다", async () => {
    const isFallback = await getL1FallbackFlag(
      { keywords: ["배포", "절차"] },
      true   // Redis에 결과 있음
    );
    expect(isFallback).toBe(false);
  });

  it("topic만 있지만 Redis 결과가 없으면 isFallback: true여야 한다", async () => {
    const isFallback = await getL1FallbackFlag(
      { topic: "architecture" },
      false
    );
    expect(isFallback).toBe(true);
  });

  it("type만 있지만 Redis 결과가 없으면 isFallback: true여야 한다", async () => {
    const isFallback = await getL1FallbackFlag(
      { type: "decision" },
      false
    );
    expect(isFallback).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 경계 케이스
// ---------------------------------------------------------------------------

describe("L1 miss 메트릭 — 경계 케이스", () => {
  it("text + keywords 복합 쿼리에서 Redis hit이면 isFallback: false이다", async () => {
    const isFallback = await getL1FallbackFlag(
      { text: "배포 절차", keywords: ["배포"] },
      true
    );
    expect(isFallback).toBe(false);
  });

  it("text + keywords 복합 쿼리에서 Redis miss이면 isFallback: true이다", async () => {
    const isFallback = await getL1FallbackFlag(
      { text: "배포 절차", keywords: ["배포"] },
      false
    );
    expect(isFallback).toBe(true);
  });

  it("빈 keywords 배열은 text-only와 동일하게 처리한다", async () => {
    const isFallback = await getL1FallbackFlag(
      { text: "배포 절차", keywords: [] },
      false
    );
    expect(isFallback).toBe(false);
  });
});
