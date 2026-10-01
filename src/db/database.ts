// SQLite 持久化：图版本、颜色约束、比较请求与证书。
// 历史结果通过 graph_version_id 绑定到具体图版本，重启后仍可查询。

import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";

export interface DbHandle {
  db: Database.Database;
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS graphs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS graph_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  graph_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  n INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(graph_id, version),
  FOREIGN KEY(graph_id) REFERENCES graphs(id)
);
CREATE TABLE IF NOT EXISTS comparisons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_version_id INTEGER NOT NULL,
  target_version_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  mapping TEXT,
  reason TEXT,
  nodes INTEGER,
  budget_nodes INTEGER,
  budget_ms INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY(source_version_id) REFERENCES graph_versions(id),
  FOREIGN KEY(target_version_id) REFERENCES graph_versions(id)
);
CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  graph_version_id INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL,
  canonical_code TEXT,
  auto_count TEXT,
  orbits TEXT,
  detail TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(graph_version_id) REFERENCES graph_versions(id)
);
CREATE TABLE IF NOT EXISTS verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_version_id INTEGER NOT NULL,
  target_version_id INTEGER NOT NULL,
  mapping TEXT NOT NULL,
  ok INTEGER NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);
`;

export function openDatabase(dataDir: string): DbHandle {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, "iso.db");
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return {
    db,
    close: () => db.close(),
  };
}
