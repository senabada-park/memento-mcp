/**
 * Admin overview 렌더링 함수 검증 테스트
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

describe("renderOverviewCards", () => {
  test("returns loading element when stats is null", () => {
    const result = mod.renderOverviewCards(null);
    assert.ok(result.hasClass("loading-spinner"), "loading spinner expected");
  });

  test("creates 6 KPI cards with correct labels", () => {
    const stats = {
      fragments: 123,
      sessions: 5,
      apiCallsToday: 42,
      activeKeys: 3,
      queues: { embeddingBacklog: 7, qualityPending: 2 }
    };
    const result = mod.renderOverviewCards(stats);
    assert.equal(result.className, "kpi-grid");
    assert.equal(result.children.length, 6, "should have 6 KPI cards");

    const labels = result.children.map(c => {
      const labelEl = c.children.find(ch => ch.className === "kpi-label");
      return labelEl?.textContent;
    });
    assert.ok(labels.includes("총 파편 수"));
    assert.ok(labels.includes("활성 세션"));
    assert.ok(labels.includes("오늘 API 호출"));
    assert.ok(labels.includes("활성 키"));
    assert.ok(labels.includes("임베딩 대기열"));
    assert.ok(labels.includes("품질 미검증"));
  });

  test("KPI card displays formatted value", () => {
    const stats = {
      fragments: 1234,
      sessions: 0,
      apiCallsToday: 0,
      activeKeys: 0,
      queues: {}
    };
    const result = mod.renderOverviewCards(stats);
    const firstCard = result.children[0];
    const valueEl   = firstCard.children.find(ch => ch.className.includes("kpi-value"));
    assert.ok(valueEl, "value element should exist");
    assert.ok(valueEl.textContent.includes("1"), "should contain formatted number");
  });
});

describe("renderHealthFlags", () => {
  test("returns null when no flags", () => {
    assert.equal(mod.renderHealthFlags(null), null);
    assert.equal(mod.renderHealthFlags({}), null);
  });

  test("creates flag rows with warn/ok indicators", () => {
    const flags = { embeddingQueueHealthy: true, dbConnectionPoolLow: false };
    const panel = mod.renderHealthFlags(flags);
    assert.ok(panel, "panel should not be null");
    assert.ok(panel.hasClass("panel"));

    const flagRows = panel.children.filter(c => c.className === "flag-row");
    assert.equal(flagRows.length, 2, "should have 2 flag rows");

    const firstIcon = flagRows[0].children[0];
    assert.ok(firstIcon.className.includes("ok"), "true flag should be ok");

    const secondIcon = flagRows[1].children[0];
    assert.ok(secondIcon.className.includes("warn"), "false flag should be warn");
  });
});

describe("utility functions", () => {
  test("esc escapes HTML characters", () => {
    assert.equal(mod.esc('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    assert.equal(mod.esc(null), "");
  });

  test("fmt formats numbers", () => {
    assert.ok(mod.fmt(1234).length > 0);
    assert.equal(mod.fmt(null), "0");
  });

  test("fmtMs formats milliseconds", () => {
    assert.equal(mod.fmtMs(null), "-");
    assert.ok(mod.fmtMs(12.345).includes("12.3"));
  });

  test("fmtPct formats percentage", () => {
    assert.equal(mod.fmtPct(null), "-");
    assert.ok(mod.fmtPct(0.1234).includes("12.3"));
  });

  test("truncate shortens text", () => {
    assert.equal(mod.truncate("abcdef", 3), "abc...");
    assert.equal(mod.truncate("ab", 3), "ab");
    assert.equal(mod.truncate("", 3), "");
  });
});
