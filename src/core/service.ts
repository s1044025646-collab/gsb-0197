// 应用服务：统一预算、校验、调用算法、落库证书。

import { Repository } from "../db/repository";
import {
  GraphData,
  makeBudget,
  normalizeGraph,
  verifyBijection,
} from "./types";
import { findIsomorphism, canonicalize } from "./iso";
import { automorphisms } from "./aut";

export interface BudgetConfig {
  maxNodes: number;
  maxMs: number;
}

export const DEFAULT_BUDGET: BudgetConfig = {
  // n<=10 时最坏（如 Petersen 图规范标号）约需 1e7 节点、约 2 秒。
  maxNodes: 50_000_000,
  maxMs: 30_000,
};

export class IsoService {
  constructor(private repo: Repository, private budget: BudgetConfig = DEFAULT_BUDGET) {}

  addGraph(name: string, data: GraphData) {
    const normalized = normalizeGraph(data); // 先校验
    const graph = this.repo.createGraph(name);
    const version = this.repo.addVersion(graph.id, data);
    return { graph, version, normalized };
  }

  listGraphs() {
    return this.repo.listGraphs().map((g) => ({
      ...g,
      versions: this.repo.listVersions(g.id).map((v) => ({
        version_id: v.id,
        version: v.version,
        n: v.n,
      })),
    }));
  }

  addVersion(graphId: number, data: GraphData) {
    normalizeGraph(data);
    return this.repo.addVersion(graphId, data);
  }

  load(versionId: number) {
    const row = this.repo.getVersion(versionId);
    if (!row) throw new Error(`图版本 ${versionId} 不存在`);
    return { row, graph: normalizeGraph(this.repo.payload(row)) };
  }

  compare(sourceVersionId: number, targetVersionId: number, budgetOverride?: Partial<BudgetConfig>) {
    const a = this.load(sourceVersionId);
    const b = this.load(targetVersionId);
    const cfg = { ...this.budget, ...budgetOverride };
    const result = findIsomorphism(a.graph, b.graph, makeBudget(cfg.maxNodes, cfg.maxMs));
    const id = this.repo.saveComparison({
      source_version_id: sourceVersionId,
      target_version_id: targetVersionId,
      status: result.status,
      mapping: result.mapping,
      reason: result.reason,
      nodes: result.nodes,
      budget_nodes: cfg.maxNodes,
      budget_ms: cfg.maxMs,
    });
    return { comparison_id: id, ...result };
  }

  analyze(versionId: number, budgetOverride?: Partial<BudgetConfig>, enumerateLimit = 64) {
    const { row, graph } = this.load(versionId);
    const cfg = { ...this.budget, ...budgetOverride };
    const budget = makeBudget(cfg.maxNodes, cfg.maxMs);
    const canon = canonicalize(graph, budget);
    const auto = automorphisms(
      graph,
      makeBudget(cfg.maxNodes, cfg.maxMs),
      enumerateLimit
    );
    // 只有两者都完整完成才发布最终证书；否则标记未决。
    const done = canon.status === "done" && auto.status === "done";
    const status = done ? "final" : "undecided";
    const detail = JSON.stringify({
      canonical: { status: canon.status, reason: canon.reason, nodes: canon.nodes },
      automorphism: { status: auto.status, reason: auto.reason, nodes: auto.nodes },
      enumerate_limit: enumerateLimit,
      sample_mappings: auto.sampleMappings,
    });
    this.repo.saveCertificate({
      graph_version_id: row.id,
      status,
      canonical_code: canon.status === "done" ? canon.code : undefined,
      auto_count: auto.status === "done" ? auto.count : undefined,
      orbits: auto.status === "done" ? auto.orbits : undefined,
      detail,
    });
    return {
      graph_version_id: row.id,
      status,
      canonical: canon,
      automorphism: auto,
    };
  }

  getCertificate(versionId: number) {
    return this.repo.getCertificate(versionId);
  }

  verifyExternalMapping(
    sourceVersionId: number,
    targetVersionId: number,
    mapping: number[]
  ) {
    const a = this.load(sourceVersionId);
    const b = this.load(targetVersionId);
    const result = verifyBijection(a.graph, b.graph, mapping);
    this.repo.saveVerification({
      source_version_id: sourceVersionId,
      target_version_id: targetVersionId,
      mapping,
      ok: result.ok,
      reason: result.reason ?? "",
    });
    return result;
  }

  report(graphId: number) {
    return this.repo.exportReport(graphId);
  }
}
