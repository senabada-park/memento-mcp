/**
 * CLI: remember - 터미널에서 파편 저장
 *
 * MemoryManager는 Redis/EmbeddingWorker 등 서버 컴포넌트를 초기화하여
 * CLI에서 프로세스가 종료되지 않는 문제가 있다.
 * FragmentFactory + FragmentWriter로 직접 DB INSERT.
 *
 * 작성자: 최진호
 * 작성일: 2026-03-28
 */

import pg from "pg";
import { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } from "../config.js";
import { FragmentFactory } from "../memory/FragmentFactory.js";

const VALID_TYPES = new Set(["fact", "decision", "error", "preference", "procedure", "relation"]);

export const usage = [
  "Usage: memento-mcp remember <content> --topic <name> [options]",
  "",
  "Store a memory fragment directly from the terminal (DB INSERT, no embedding).",
  "",
  "Options:",
  "  --topic <name>        Topic label (required)",
  "  --type <type>         Fragment type: fact|decision|error|preference|procedure|relation (default: fact)",
  "  --importance <0-1>    Importance score (default: auto from type)",
  "  --keywords <a,b,c>    Comma-separated keywords",
  "  --source <name>       Source label (default: cli)",
  "  --json                Output result as JSON",
  "",
  "Examples:",
  "  memento-mcp remember 'Redis port is 6380' --topic infra --type fact",
  "  memento-mcp remember 'Use bcrypt rounds=12' --topic security --type decision --importance 0.8",
].join("\n");

export default async function remember(args) {
  const content = args._.join(" ");
  if (!content || !args.topic) {
    console.error("Usage: memento remember <content> --topic x [--type fact] [--importance 0.7] [--json]");
    process.exit(1);
  }

  const type = args.type || "fact";
  if (!VALID_TYPES.has(type)) {
    console.error(`Invalid type: ${type}. Valid: ${[...VALID_TYPES].join(", ")}`);
    process.exit(1);
  }

  const pool = new pg.Pool({
    host: DB_HOST, port: DB_PORT, database: DB_NAME,
    user: DB_USER, password: DB_PASSWORD, max: 2
  });

  try {
    const factory  = new FragmentFactory();
    const fragment = factory.create({
      content,
      topic:      args.topic,
      type,
      importance: args.importance ? parseFloat(args.importance) : undefined,
      keywords:   args.keywords  ? args.keywords.split(",").map(k => k.trim()) : undefined,
      source:     args.source    || "cli",
      agentId:    "cli",
    });

    await pool.query("SET search_path TO agent_memory, public");
    await pool.query(
      `INSERT INTO fragments
        (id, content, topic, keywords, type, importance, content_hash, ttl_tier, source, agent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        fragment.id, fragment.content, fragment.topic,
        fragment.keywords, fragment.type, fragment.importance,
        fragment.content_hash, fragment.ttl_tier || "warm",
        fragment.source || "cli", fragment.agent_id || "cli"
      ]
    );

    if (args.json) {
      console.log(JSON.stringify({ success: true, id: fragment.id, keywords: fragment.keywords, type: fragment.type, importance: fragment.importance }, null, 2));
    } else {
      console.log("Fragment stored");
      console.log("===============");
      console.log(`ID:         ${fragment.id}`);
      console.log(`Keywords:   ${(fragment.keywords || []).join(", ")}`);
      console.log(`Type:       ${fragment.type}`);
      console.log(`Importance: ${fragment.importance}`);
      console.log(`TTL tier:   ${fragment.ttl_tier || "warm"}`);

      if (fragment.importance < 0.3) {
        console.log(`\nWarning: low importance (${fragment.importance}) — may be garbage collected early.`);
      }
    }
  } catch (err) {
    console.error(`[remember] ${err.message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}
