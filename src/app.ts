import { Store, GraphVersionRow } from "./store.js";
import { GraphInput, GraphData, Budget, DEFAULT_BUDGET, MAX_N } from "./types.js";
import { buildGraph, GraphError, renumber, verifyBijection } from "./graph.js";
import { checkIsomorphism, analyzeAutomorphisms, canonicalLabel } from "./service.js";

export { GraphError } from "./graph.js";

export interface GraphRef {
  name: string;
  version?: number;
}

export class App {
  constructor(readonly store: Store) {}

  saveGraph(input: GraphInput & { name: string }): {
    graphId: number;
    version: GraphVersionRow;
  } {
    const graph = buildGraph(input); // 先校验再入库
    void graph;
    const graphId = this.store.getOrCreateGraph(input.name);
    const payload = { n: input.n, edges: input.edges ?? [], colors: input.colors ?? {} };
    const version = this.store.addVersion(graphId, payload);
    return { graphId, version };
  }

  resolve(ref: GraphRef): { row: GraphVersionRow; graph: GraphData } {
    const latest = this.store.latestVersion(ref.name);
    if (!latest) throw new GraphError(`图不存在：${ref.name}`);
    const row =
      ref.version === undefined
        ? latest
        : this.store.getVersion(latest.graph_id, ref.version) ??
          (() => {
            throw new GraphError(`图 ${ref.name} 不存在版本 ${ref.version}`);
          })();
    const graph = buildGraph(JSON.parse(row.payload) as GraphInput);
    return { row, graph };
  }

  renumberGraph(ref: GraphRef, oldToNew: number[]): GraphVersionRow {
    const { row, graph } = this.resolve(ref);
    const next = renumber(graph, oldToNew);
    const payload = graphToInput(next);
    const newVersion = this.store.addVersion(row.graph_id, payload);
    return newVersion;
  }

  isomorphism(
    g1Ref: GraphRef,
    g2Ref: GraphRef,
    budget?: Partial<Budget>,
    countAll = false,
  ): Record<string, unknown> {
    const a = this.resolve(g1Ref);
    const b = this.resolve(g2Ref);
    const merged = mergeBudget(budget);
    const result = checkIsomorphism(a.graph, b.graph, merged, countAll);
    const id = this.store.saveComparison(a.row.id, b.row.id, result.status, result, merged);
    return {
      certificateId: id,
      g1: { name: g1Ref.name, version: a.row.version, versionId: a.row.id },
      g2: { name: g2Ref.name, version: b.row.version, versionId: b.row.id },
      budget: merged,
      ...result,
    };
  }

  canonical(ref: GraphRef, budget?: Partial<Budget>): Record<string, unknown> {
    const { row, graph } = this.resolve(ref);
    const merged = mergeBudget(budget);
    const result = canonicalLabel(graph, merged);
    if (result.status === "proved") {
      this.store.saveCanonical(row.id, result.status, result, merged);
    }
    return {
      graph: { name: ref.name, version: row.version, versionId: row.id },
      budget: merged,
      ...result,
    };
  }

  getCanonicalCert(ref: GraphRef): Record<string, unknown> | undefined {
    const { row } = this.resolve(ref);
    const cert = this.store.getCanonical(row.id);
    if (!cert) return undefined;
    return { ...cert, result: JSON.parse(cert.result as string), budget: JSON.parse(cert.budget as string) };
  }

  automorphisms(ref: GraphRef, budget?: Partial<Budget>): Record<string, unknown> {
    const { row, graph } = this.resolve(ref);
    const merged = mergeBudget(budget);
    const result = analyzeAutomorphisms(graph, merged);
    if (result.status === "proved") {
      this.store.saveAutomorphism(row.id, result.status, result, merged);
    }
    return {
      graph: { name: ref.name, version: row.version, versionId: row.id },
      budget: merged,
      ...result,
    };
  }

  getAutomorphismCert(ref: GraphRef): Record<string, unknown> | undefined {
    const { row } = this.resolve(ref);
    const cert = this.store.getAutomorphism(row.id);
    if (!cert) return undefined;
    return { ...cert, result: JSON.parse(cert.result as string), budget: JSON.parse(cert.budget as string) };
  }

  verify(ref1: GraphRef, ref2: GraphRef, mapping: number[]): Record<string, unknown> {
    const a = this.resolve(ref1);
    const b = this.resolve(ref2);
    const report = verifyBijection(a.graph, b.graph, mapping);
    return {
      g1: { name: ref1.name, version: a.row.version, versionId: a.row.id },
      g2: { name: ref2.name, version: b.row.version, versionId: b.row.id },
      mapping,
      ...report,
    };
  }

  comparisonCertificate(id: number): Record<string, unknown> | undefined {
    const cert = this.store.getComparison(id);
    if (!cert) return undefined;
    const v1 = this.store.getVersionById(cert.g1_version_id as number)!;
    const v2 = this.store.getVersionById(cert.g2_version_id as number)!;
    return {
      ...cert,
      result: JSON.parse(cert.result as string),
      budget: JSON.parse(cert.budget as string),
      graph1: { versionId: v1.id, graphId: v1.graph_id, version: v1.version, payload: JSON.parse(v1.payload) },
      graph2: { versionId: v2.id, graphId: v2.graph_id, version: v2.version, payload: JSON.parse(v2.payload) },
    };
  }
}

export function graphToInput(g: GraphData): GraphInput {
  const edges: Array<{ u: number; v: number }> = [];
  for (let u = 0; u < g.n; u++)
    for (let v = u + 1; v < g.n; v++) if (g.adj[u][v]) edges.push({ u, v });
  const colors: Record<number, string> = {};
  g.colors.forEach((c, i) => {
    if (c !== "default") colors[i] = c;
  });
  return { n: g.n, edges, colors };
}

export function mergeBudget(partial?: Partial<Budget>): Budget {
  return {
    maxNodes: clampInt(partial?.maxNodes, 1, 10_000_000_000, DEFAULT_BUDGET.maxNodes),
    maxMs: clampInt(partial?.maxMs, 1, 600_000, DEFAULT_BUDGET.maxMs),
    maxMappings: clampInt(partial?.maxMappings, 0, 100_000, DEFAULT_BUDGET.maxMappings),
  };
}

function clampInt(v: number | undefined, lo: number, hi: number, dflt: number): number {
  if (v === undefined || v === null || Number.isNaN(Number(v))) return dflt;
  const n = Math.floor(Number(v));
  return Math.min(hi, Math.max(lo, n));
}

export { MAX_N };
