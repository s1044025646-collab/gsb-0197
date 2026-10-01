import {
  Budget,
  CanonicalResult,
  DEFAULT_BUDGET,
  GraphData,
  MappingResult,
  OrbitResult,
} from "./types.js";
import { verifyBijection } from "./graph.js";
import { canonicalLabel } from "./canonical.js";
import { solveIsomorphisms, incompatibility } from "./search.js";

export interface IsoResponse {
  status: "isomorphic" | "non-isomorphic" | "undetermined";
  mapping?: number[];
  witnesses: number[][];
  isomorphismCount?: string;
  countExact: boolean;
  nodesSearched: number;
  elapsedMs: number;
  reason: string;
  verification?: { valid: boolean; errors: string[] };
}

/** 同构查询：存在性优先；找到后对见证双射做独立逐边核验；需要时再完整计数。 */
export function checkIsomorphism(
  g1: GraphData,
  g2: GraphData,
  budget: Budget = DEFAULT_BUDGET,
  countAll = false,
): IsoResponse {
  const conflict = incompatibility(g1, g2);
  if (conflict !== null) {
    return {
      status: "non-isomorphic",
      witnesses: [],
      countExact: true,
      isomorphismCount: "0",
      nodesSearched: 0,
      elapsedMs: 0,
      reason: `不变量冲突：${conflict}`,
    };
  }

  const outcome = solveIsomorphisms(g1, g2, {
    budget,
    collectMappings: 1,
    stopAfter: countAll ? undefined : 1n,
  });

  if (outcome.mappings.length > 0) {
    const mapping = outcome.mappings[0]!;
    const verification = verifyBijection(g1, g2, mapping);
    return {
      status: "isomorphic",
      mapping,
      witnesses: outcome.mappings,
      isomorphismCount: countAll ? outcome.count.toString() : undefined,
      countExact: countAll ? outcome.complete : true,
      nodesSearched: outcome.nodesSearched,
      elapsedMs: outcome.elapsedMs,
      verification,
      reason: verification.valid
        ? "已找到保颜色双射，并通过逐边/逐非边核验"
        : "内部错误：候选映射核验失败",
    };
  }

  if (outcome.complete) {
    return {
      status: "non-isomorphic",
      witnesses: [],
      isomorphismCount: "0",
      countExact: true,
      nodesSearched: outcome.nodesSearched,
      elapsedMs: outcome.elapsedMs,
      reason: `回溯搜索已穷尽（访问 ${outcome.nodesSearched} 个节点），不存在保颜色双射`,
    };
  }

  return {
    status: "undetermined",
    witnesses: [],
    countExact: false,
    nodesSearched: outcome.nodesSearched,
    elapsedMs: outcome.elapsedMs,
    reason: `预算内未完成搜索（节点 ${outcome.nodesSearched}，用时 ${outcome.elapsedMs}ms），不能判定为不同构`,
  };
}

/**
 * 自同构：枚举 g -> g 的全部保色双射。
 * 计数为 BigInt；只有搜索完整时才发布精确总数。
 * 轨道用实际枚举到的映射的并查聚合；未完整枚举时标记未决。
 */
export function analyzeAutomorphisms(g: GraphData, budget: Budget = DEFAULT_BUDGET): OrbitResult {
  const outcome = solveIsomorphisms(g, g, {
    budget,
    collectMappings: budget.maxMappings,
  });

  const truncated = outcome.count > BigInt(outcome.mappings.length);
  if (!outcome.complete) {
    return {
      status: "undetermined",
      mappings: outcome.mappings,
      mappingsTruncated: truncated,
      nodesSearched: outcome.nodesSearched,
      elapsedMs: outcome.elapsedMs,
      budgetExceeded: true,
      countExact: false,
      reason: `预算内仅验证 ${outcome.mappings.length} 个自同构（恒等映射必在其中），总数待定`,
    };
  }

  return {
    status: "proved",
    automorphismCount: outcome.count.toString(),
    orbits: computeOrbits(g.n, outcome.mappings),
    mappings: outcome.mappings,
    mappingsTruncated: truncated,
    nodesSearched: outcome.nodesSearched,
    elapsedMs: outcome.elapsedMs,
    budgetExceeded: false,
    countExact: true,
    reason: `搜索已穷尽，共 ${outcome.count} 个保颜色自同构；轨道由全部自同构聚合得到`,
  };

}

/** 由自同构集合计算轨道：i,j 同轨道当且仅当存在自同构把 i 映到 j。 */
function computeOrbits(n: number, mappings: number[][]): number[][] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]!;
      x = parent[x]!;
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  for (const m of mappings) {
    for (let i = 0; i < n; i++) union(i, m[i]!);
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(i);
  }
  return [...groups.values()];
}

export { canonicalLabel };
