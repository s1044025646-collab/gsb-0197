/**
 * SQLite 持久化层。
 * 使用 Node.js 内置 node:sqlite（Node 22.5+ 实验模块，Node 25 可用），
 * 无需任何原生编译工具链，Windows 本地开箱即用。
 *
 * 所有历史结果（比较证书、规范证书、自同构证书）都通过 graph_version_id
 * 强绑定到具体的图版本；图更新产生新版本，旧证书仍可查询且不会张冠李戴。
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface GraphVersionRow {
  id: number;
  graph_id: number;
  name: string;
  version: number;
  payload: string;
  created_at: string;
}

export class Store {
  readonly db: DatabaseSync;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS graphs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS graph_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        graph_id INTEGER NOT NULL REFERENCES graphs(id),
        version INTEGER NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(graph_id, version)
      );
      CREATE TABLE IF NOT EXISTS comparisons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        g1_version_id INTEGER NOT NULL REFERENCES graph_versions(id),
        g2_version_id INTEGER NOT NULL REFERENCES graph_versions(id),
        status TEXT NOT NULL,
        result TEXT NOT NULL,
        budget TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS canonical_certs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        graph_version_id INTEGER NOT NULL UNIQUE REFERENCES graph_versions(id),
        status TEXT NOT NULL,
        result TEXT NOT NULL,
        budget TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS automorphism_certs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        graph_version_id INTEGER NOT NULL UNIQUE REFERENCES graph_versions(id),
        status TEXT NOT NULL,
        result TEXT NOT NULL,
        budget TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  createGraph(name: string): number {
    this.db.prepare("INSERT INTO graphs(name) VALUES (?)").run(name);
    return Number(this.db.prepare("SELECT last_insert_rowid() AS id").get()!.id);
  }

  getGraphByName(name: string): { id: number; name: string } | undefined {
    return this.db.prepare("SELECT id, name FROM graphs WHERE name = ?").get(name) as
      | { id: number; name: string }
      | undefined;
  }

  getOrCreateGraph(name: string): number {
    const existing = this.getGraphByName(name);
    if (existing) return existing.id;
    return this.createGraph(name);
  }

  addVersion(graphId: number, payload: unknown): GraphVersionRow {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(version), 0) + 1 AS v FROM graph_versions WHERE graph_id = ?")
      .get(graphId) as { v: number };
    const version = row.v;
    this.db
      .prepare("INSERT INTO graph_versions(graph_id, version, payload) VALUES (?, ?, ?)")
      .run(graphId, version, JSON.stringify(payload));
    return this.getVersion(graphId, version)!;
  }

  getVersion(graphId: number, version: number): GraphVersionRow | undefined {
    return this.db
      .prepare(
        `SELECT gv.* FROM graph_versions gv
         WHERE gv.graph_id = ? AND gv.version = ?`,
      )
      .get(graphId, version) as GraphVersionRow | undefined;
  }

  getVersionById(versionId: number): GraphVersionRow | undefined {
    return this.db
      .prepare("SELECT * FROM graph_versions WHERE id = ?")
      .get(versionId) as GraphVersionRow | undefined;
  }

  latestVersion(graphName: string): GraphVersionRow | undefined {
    return this.db
      .prepare(
        `SELECT gv.* FROM graph_versions gv
         JOIN graphs g ON g.id = gv.graph_id
         WHERE g.name = ? ORDER BY gv.version DESC LIMIT 1`,
      )
      .get(graphName) as GraphVersionRow | undefined;
  }

  listGraphs(): Array<{ id: number; name: string; latest_version: number }> {
    return this.db
      .prepare(
        `SELECT g.id, g.name, COALESCE(MAX(gv.version), 0) AS latest_version
         FROM graphs g LEFT JOIN graph_versions gv ON gv.graph_id = g.id
         GROUP BY g.id ORDER BY g.name`,
      )
      .all() as Array<{ id: number; name: string; latest_version: number }>;
  }

  saveComparison(v1: number, v2: number, status: string, result: unknown, budget: unknown): number {
    this.db
      .prepare(
        `INSERT INTO comparisons(g1_version_id, g2_version_id, status, result, budget)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(v1, v2, status, JSON.stringify(result), JSON.stringify(budget));
    return Number(this.db.prepare("SELECT last_insert_rowid() AS id").get()!.id);
  }

  listComparisons(limit = 50): unknown[] {
    return this.db
      .prepare("SELECT * FROM comparisons ORDER BY id DESC LIMIT ?")
      .all(limit) as unknown[];
  }

 getComparison(id: number): Record<string, unknown> | undefined {
    return this.db.prepare("SELECT * FROM comparisons WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
  }

  saveCanonical(versionId: number, status: string, result: unknown, budget: unknown): void {
    this.db
      .prepare(
        `INSERT INTO canonical_certs(graph_version_id, status, result, budget)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(graph_version_id) DO UPDATE SET
           status=excluded.status, result=excluded.result, budget=excluded.budget,
           created_at=datetime('now')`,
      )
      .run(versionId, status, JSON.stringify(result), JSON.stringify(budget));
  }

  getCanonical(versionId: number): Record<string, unknown> | undefined {
    return this.db.prepare("SELECT * FROM canonical_certs WHERE graph_version_id = ?").get(versionId) as
      | Record<string, unknown>
      | undefined;
  }

  saveAutomorphism(versionId: number, status: string, result: unknown, budget: unknown): void {
    this.db
      .prepare(
        `INSERT INTO automorphism_certs(graph_version_id, status, result, budget)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(graph_version_id) DO UPDATE SET
           status=excluded.status, result=excluded.result, budget=excluded.budget,
           created_at=datetime('now')`,
      )
      .run(versionId, status, JSON.stringify(result), JSON.stringify(budget));
  }

  getAutomorphism(versionId: number): Record<string, unknown> | undefined {
    return this.db
      .prepare("SELECT * FROM automorphism_certs WHERE graph_version_id = ?")
      .get(versionId) as Record<string, unknown> | undefined;
  }

  close(): void {
    this.db.close();
  }
}
