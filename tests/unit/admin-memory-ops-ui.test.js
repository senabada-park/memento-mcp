/**
 * Admin 메모리 운영 UI 렌더링 검증 테스트
 *
 * 작성자: 최진호
 * 작성일: 2026-03-26
 */

import { test, describe, before } from "node:test";
import assert                     from "node:assert/strict";
import { loadAdminModule }        from "./admin-dom-shim.js";

let mod;

before(() => {
  mod = loadAdminModule();
});

describe("renderMemoryFilters", () => {
  test("creates filter bar with expected inputs", () => {
    mod.state.memoryFilter = { topic: "", type: "", key_id: "" };
    const bar = mod.renderMemoryFilters();
    assert.equal(bar.className, "filter-bar");
    assert.equal(bar.id, "memory-filters");
    assert.equal(bar.children.length, 4, "should have 4 filter elements");

    assert.equal(bar.children[0].id, "filter-topic");
    assert.equal(bar.children[1].id, "filter-type");
    assert.equal(bar.children[2].id, "filter-key-id");
    assert.equal(bar.children[3].id, "filter-search");
  });

  test("type select includes all fragment types", () => {
    mod.state.memoryFilter = { topic: "", type: "", key_id: "" };
    const bar    = mod.renderMemoryFilters();
    const select = bar.children[1];
    const values = select.children.map(o => o.value);

    assert.ok(values.includes(""));
    assert.ok(values.includes("fact"));
    assert.ok(values.includes("error"));
    assert.ok(values.includes("decision"));
    assert.ok(values.includes("procedure"));
    assert.ok(values.includes("preference"));
  });
});

describe("renderFragmentList", () => {
  test("shows empty message when no fragments", () => {
    const result = mod.renderFragmentList([]);
    assert.ok(result.textContent.includes("결과 없음"));
  });

  test("shows empty message for null", () => {
    const result = mod.renderFragmentList(null);
    assert.ok(result.textContent.includes("결과 없음"));
  });

  test("creates table rows for fragments", () => {
    mod.state.selectedFragment = null;
    const fragments = [
      { id: "f1", type: "fact", topic: "test-topic", content: "some content", created_at: "2026-01-01T00:00:00Z" },
      { id: "f2", type: "error", topic: "error-topic", content: "error details", created_at: "2026-01-02T00:00:00Z" }
    ];
    const result = mod.renderFragmentList(fragments);
    assert.equal(result.className, "data-table-wrap");

    const table = result.children[0];
    assert.equal(table.id, "fragment-table");

    const tbody = table.children[1];
    assert.equal(tbody.children.length, 2, "should have 2 fragment rows");
  });

  test("fragment row displays topic text", () => {
    mod.state.selectedFragment = null;
    const fragments = [
      { id: "f1", type: "fact", topic: "my-topic", content: "content", created_at: null }
    ];
    const result = mod.renderFragmentList(fragments);
    const table  = result.children[0];
    const tbody  = table.children[1];
    const row    = tbody.children[0];
    const topicTd = row.children[1];
    assert.equal(topicTd.textContent, "my-topic");
  });
});

describe("renderAnomalyCards", () => {
  test("returns empty fragment for null anomalies", () => {
    const result = mod.renderAnomalyCards(null);
    assert.equal(result.children.length, 0);
  });

  test("creates 3 anomaly cards", () => {
    const anomalies = { qualityUnverified: 5, staleFragments: 12, failedSearches: 0 };
    const result = mod.renderAnomalyCards(anomalies);
    assert.equal(result.className, "anomaly-grid");
    assert.equal(result.children.length, 3);
  });

  test("anomaly card displays label and count", () => {
    const anomalies = { qualityUnverified: 42, staleFragments: 0, failedSearches: 0 };
    const result = mod.renderAnomalyCards(anomalies);
    const first  = result.children[0];

    const titleEl = first.children.find(c => c.className === "anomaly-title");
    const countEl = first.children.find(c => c.className === "anomaly-count");
    assert.equal(titleEl.textContent, "품질 미검증");
    assert.ok(countEl.textContent.includes("42"));
  });

  test("anomaly card has correct severity class", () => {
    const anomalies = { qualityUnverified: 1, staleFragments: 2, failedSearches: 3 };
    const result = mod.renderAnomalyCards(anomalies);

    const warnCard  = result.children[0];
    const errorCard = result.children[2];
    assert.ok(warnCard.className.includes("warn"));
    assert.ok(errorCard.className.includes("error"));
  });
});
