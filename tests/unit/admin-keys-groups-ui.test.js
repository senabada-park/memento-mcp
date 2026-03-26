/**
 * Admin 키/그룹 UI 렌더링 검증 테스트
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

describe("renderKeyTable", () => {
  test("creates table with correct headers", () => {
    mod.state.selectedKeyId = null;
    const keys = [
      { id: "k1", name: "test-key", status: "active", key_prefix: "mmcp_abc", daily_limit: 10000, today_calls: 5, created_at: "2026-01-01T00:00:00Z" }
    ];
    const result = mod.renderKeyTable(keys);
    assert.equal(result.className, "data-table-wrap");

    const table = result.children[0];
    assert.ok(table);
    assert.equal(table.id, "keys-table");

    const thead = table.children[0];
    const hRow  = thead.children[0];
    assert.equal(hRow.children.length, 6, "should have 6 header columns");
  });

  test("creates row for each key", () => {
    mod.state.selectedKeyId = null;
    const keys = [
      { id: "k1", name: "key-a", status: "active", key_prefix: "mmcp_a", daily_limit: 1000, created_at: null },
      { id: "k2", name: "key-b", status: "inactive", key_prefix: "mmcp_b", daily_limit: 500, created_at: null }
    ];
    const result = mod.renderKeyTable(keys);
    const table  = result.children[0];
    const tbody  = table.children[1];
    assert.equal(tbody.children.length, 2, "should have 2 data rows");
  });

  test("marks selected row", () => {
    mod.state.selectedKeyId = "k2";
    const keys = [
      { id: "k1", name: "key-a", status: "active", key_prefix: "mmcp_a" },
      { id: "k2", name: "key-b", status: "inactive", key_prefix: "mmcp_b" }
    ];
    const result = mod.renderKeyTable(keys);
    const table  = result.children[0];
    const tbody  = table.children[1];
    const row2   = tbody.children[1];
    assert.ok(row2.className.includes("selected"), "second row should be selected");
    mod.state.selectedKeyId = null;
  });
});

describe("renderGroupCards", () => {
  test("shows empty message when no groups", () => {
    mod.state.selectedGroupId = null;
    const result = mod.renderGroupCards([]);
    assert.ok(result.textContent.includes("그룹이 없습니다"));
  });

  test("creates card for each group", () => {
    mod.state.selectedGroupId = null;
    const groups = [
      { id: "g1", name: "team-a", description: "Alpha team", member_count: 3 },
      { id: "g2", name: "team-b", description: null, member_count: 0 }
    ];
    const result = mod.renderGroupCards(groups);
    assert.equal(result.className, "group-grid");
    assert.equal(result.children.length, 2, "should have 2 group cards");
  });

  test("group card displays name and member count", () => {
    mod.state.selectedGroupId = null;
    const groups = [
      { id: "g1", name: "team-alpha", description: "Test", member_count: 5 }
    ];
    const result = mod.renderGroupCards(groups);
    const card   = result.children[0];

    const nameEl  = card.children.find(c => c.className === "group-name");
    const countEl = card.children.find(c => c.className === "group-count");
    assert.equal(nameEl.textContent, "team-alpha");
    assert.ok(countEl.textContent.includes("5"));
  });

  test("marks selected group card", () => {
    mod.state.selectedGroupId = "g2";
    const groups = [
      { id: "g1", name: "team-a" },
      { id: "g2", name: "team-b" }
    ];
    const result = mod.renderGroupCards(groups);
    const card2  = result.children[1];
    assert.ok(card2.className.includes("selected"));
    mod.state.selectedGroupId = null;
  });
});
