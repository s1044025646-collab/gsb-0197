// 仓储层：封装图版本、比较、证书的读写与报告导出。

import Database from "better-sqlite3";
import { GraphData } from "../core/types";

export interface GraphRow {
  id: number;
  name: string;
  created_at: string;
}
export interface VersionRow {
  id: number;
  graph_id: number;
  version: number;
  n: number;
  payload: string;
  created_at: string;
}

export class Repository {
  constructor(private db: Database.Database) {}

  createGraph(name: string): GraphRow {
    const created_at = new Date().toISOString();
    const info = this.db
      .prepare("INSERT INTO graphs(name, created_at) VALUES (?, ?)")
      .run(name, created_at);
    return { id: Number(info.lastInsertRowid), name, created_at };
  }

  getGraph(id: number): GraphRow | undefined {
    return this.db.prepare("SELECT * FROM graphs WHERE id=?").get(id) as
      | GraphRow
      | undefined;
  }

  listGraphs(): GraphRow[] {
    return this.db.prepare("SELECT * FROM graphs ORDER BY id").all() as GraphRow[];
  }

  /** 新增一个不可变图版本；返回新版本号。 */
  addVersion(graphId: number, data: GraphData): VersionRow {
    const last = this.db
      .prepare("SELECT COALESCE(MAX(version),0) AS v FROM graph_versions WHERE graph_id=?")
      .get(graphId) as { v: number };
    const version = last.v + 1;
    const created_at = new Date().toISOString();
    const info = this.db
      .prepare(
        "INSERT INTO graph_versions(graph_id,version,n,payload,created_at) VALUES (?,?,?,?,?)"
      )
      .run(graphId, version, data.n, JSON.stringify(data), created_at);
    return {
      id: Number(info.lastInsertRowid),
      graph_id: graphId,
      version,
      n: data.n,
      payload: JSON.stringify(data),
      created_at,
    };
  }

  getVersion(id: number): VersionRow | undefined {
    return this.db.prepare("SELECT * FROM graph_versions WHERE id=?").get(id) as
      | VersionRow
      | undefined;
  }

  getVersionByNumber(graphId: number, version: number): VersionRow | undefined {
    return this.db
      .prepare("SELECT * FROM graph_versions WHERE graph_id=? AND version=?")
      .get(graphId, version) as VersionRow | undefined;
  }

  listVersions(graphId: number): VersionRow[] {
    return this.db
      .prepare("SELECT * FROM graph_versions WHERE graph_id=? ORDER BY version")
      .all(graphId) as VersionRow[];
  }

  payload(row: VersionRow): GraphData {
    return JSON.parse(row.payload) as GraphData;
  }

  saveComparison(input: {
    source_version_id: number;
    target_version_id: number;
    status: string;
    mapping?: number[];
    reason: string;
    nodes: number;
    budget_nodes: number;
    budget_ms: number;
  }): number {
    const info = this.db
      .prepare(
        `INSERT INTO comparisons
        (source_version_id,target_version_id,status,mapping,reason,nodes,budget_nodes,budget_ms,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run(
        input.source_version_id,
        input.target_version_id,
        input.status,
        input.mapping ? JSON.stringify(input.mapping) : null,
        input.reason,
        input.nodes,
        input.budget_nodes,
        input.budget_ms,
        new Date().toISOString()
      );
    return Number(info.lastInsertRowid);
  }

  saveCertificate(input: {
    graph_version_id: number;
    status: string;
    canonical_code?: string;
    auto_count?: string;
    orbits?: number[][];
    detail: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO certificates(graph_version_id,status,canonical_code,auto_count,orbits,detail,created_at)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(graph_version_id) DO UPDATE SET
           status=excluded.status, canonical_code=excluded.canonical_code,
           auto_count=excluded.auto_count, orbits=excluded.orbits,
           detail=excluded.detail, created_at=excluded.created_at`
      )
      .run(
        input.graph_version_id,
        input.status,
        input.canonical_code ?? null,
        input.auto_count ?? null,
        input.orbits ? JSON.stringify(input.orbits) : null,
        input.detail,
        new Date().toISOString()
      );
  }

  getCertificate(graphVersionId: number) {
    return this.db
      .prepare("SELECT * FROM certificates WHERE graph_version_id=?")
      .get(graphVersionId) as
      | {
          id: number;
          graph_version_id: number;
          status: string;
          canonical_code: string | null;
          auto_count: string | null;
          orbits: string | null;
          detail: string;
          created_at: string;
        }
      | undefined;
  }

  saveVerification(input: {
    source_version_id: number;
    target_version_id: number;
    mapping: number[];
    ok: boolean;
    reason: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO verifications(source_version_id,target_version_id,mapping,ok,reason,created_at)
         VALUES (?,?,?,?,?,?)`
      )
      .run(
        input.source_version_id,
        input.target_version_id,
        JSON.stringify(input.mapping),
        input.ok ? 1 : 0,
        input.reason,
        new Date().toISOString()
      );
  }

  /** 导出绑定到具体图版本的完整报告（JSON 可序列化）。 */
  exportReport(graphId: number) {
    const graph = this.getGraph(graphId);
    if (!graph) return undefined;
    const versions = this.listVersions(graphId).map((v) => {
      const cert = this.getCertificate(v.id);
      const comparisons = this.db
        .prepare("SELECT * FROM comparisons WHERE source_version_id=? OR target_version_id=? ORDER BY id")
        .all(v.id, v.id);
      return {
        version_id: v.id,
        version: v.version,
        n: v.n,
        graph: this.payload(v),
        certificate: cert
          ? {
              status: cert.status,
              canonical_code: cert.canonical_code,
              auto_count: cert.auto_count,
              orbits: cert.orbits ? JSON.parse(cert.orbits) : null,
              detail: cert.detail,
              created_at: cert.created_at,
            }
          : null,
        comparisons,
      };
    });
    return { graph, versions, exported_at: new Date().toISOString() };
  }
}
