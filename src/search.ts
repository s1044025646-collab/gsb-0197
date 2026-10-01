import { GraphData, Budget, DEFAULT_BUDGET } from "./types.js";
import { degree, refineColors } from "./graph.js";

/** 搜索过程中收集到的信息。 */
interface SearchState {
  nodes: number;
  deadline: number;
  budgetExceeded: boolean;
}

export interface SolveOptions {
  budget?: Budget;
  /** 最多保留多少个解；计数仍持续（除非预算耗尽），传 0 表示一个解即停（存在性）。 */
  collectMappings: number;
  /** 计数到该值即提前停止（如只需要“有无”），省略表示全计数。 */
  stopAfter?: bigint;
}

export interface SolveOutcome {
  mappings: number[][];
  count: bigint;
  complete: boolean;
  nodesSearched: number;
  elapsedMs: number;
  budgetExceeded: boolean;
}

/** 快速不变量不兼容判定（必要条件，违反则必然不同构）。 */
export function incompatibility(g1: GraphData, g2: GraphData): string | null {
  if (g1.n !== g2.n) return `顶点数不同：${g1.n} vs ${g2.n}`;
  if (g1.n === 0) return null;
  const degHist = (g: GraphData) => {
    const h = new Map<number, number>();
    for (let v = 0; v < g.n; v++) h.set(degree(g, v), (h.get(degree(g, v)) ?? 0) + 1);
    return [...h.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(";");
  };
  if (degHist(g1) !== degHist(g2)) return "度数分布不同，不可能同构";

  const colorHist = (g: GraphData) => {
    const h = new Map<string, number>();
    for (const c of g.colors) h.set(c, (h.get(c) ?? 0) + 1);
    return [...h.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([c, k]) => `${c}:${k}`).join(";");
  };
  if (colorHist(g1) !== colorHist(g2)) return "固定颜色的顶点数量不一致（颜色名固定，不做重命名）";

  // 细化颜色类的大小多集也是必要条件。
  const r1 = refineColors(g1);
  const r2 = refineColors(g2);
  const classHist = (cls: number[]) => {
    const h = new Map<number, number>();
    for (const c of cls) h.set(c, (h.get(c) ?? 0) + 1);
    return [...h.values()].sort((a, b) => a - b).join(",");
  };
  if (classHist(r1) !== classHist(r2)) {
    return "颜色细化后的等价类大小分布不同，回溯搜索不可能成功";
  }
  return null;
}

/**
 * 通用保色同构回溯：
 * 找所有满足 颜色相等 + 逐边/逐非边一致 的双射。
 * 采用最小剩余候选域（MRV）选点，每次赋值后做前向检查，
 * 搜索是完备的——不会因“对称看起来等价”而跳过分支，
 * 除非预算耗尽（此时 complete=false，调用方必须按未决处理）。
 */
export function solveIsomorphisms(
  g1: GraphData,
  g2: GraphData,
  options: SolveOptions,
): SolveOutcome {
  const budget = options.budget ?? DEFAULT_BUDGET;
  const start = Date.now();
  const state: SearchState = { nodes: 0, deadline: start + budget.maxMs, budgetExceeded: false };
  const n = g1.n;
  const mappings: number[][] = [];
  let count = 0n;
  const stopAfter = options.stopAfter;

  if (n === 0) {
    mappings.push([]);
    return finish(mappings, 1n, true, state, start);
  }

  const reason = incompatibility(g1, g2);
  if (reason !== null) {
    return finish(mappings, 0n, true, state, start);
  }

  const c1 = refineColors(g1);
  const c2 = refineColors(g2);
  // 初始候选域：固定颜色名相同、度数相同，且细化颜色签名一致。
  // 细化签名作为跨图的结构性必要条件剪枝；真正的逐边一致性在赋值时检查。
  const sig1 = c1.map((cls, u) => refinedSignature(g1, c1, u));
  const sig2 = c2.map((cls, w) => refinedSignature(g2, c2, w));
  const initialDomains: number[][] = [];
  for (let u = 0; u < n; u++) {
    const dom: number[] = [];
    for (let w = 0; w < n; w++) {
      if (
        g1.colors[u] === g2.colors[w] &&
        degree(g1, u) === degree(g2, w) &&
        sig1[u] === sig2[w]
      ) {
        dom.push(w);
      }
    }
    initialDomains.push(dom);
  }
  if (initialDomains.some((d) => d.length === 0)) {
    return finish(mappings, 0n, true, state, start);
  }

  const assign = new Array<number>(n).fill(-1);
  const used = new Array<boolean>(n).fill(false);

  const tick = (): boolean => {
    state.nodes++;
    if ((state.nodes & 8191) === 0 && Date.now() > state.deadline) {
      state.budgetExceeded = true;
      return false;
    }
    if (state.nodes > budget.maxNodes) {
      state.budgetExceeded = true;
      return false;
    }
    return true;
  };

  const dfs = (assigned: number): boolean => {
    if (!tick()) return false;
    if (assigned === n) {
      count++;
      if (mappings.length < options.collectMappings) mappings.push(assign.slice());
      return stopAfter === undefined || count < stopAfter;
    }

    // MRV：在未赋值顶点中选当前候选域最小者；平局时选度数较大者（约束更强）。
    let pick = -1;
    let pickDomain: number[] = [];
    for (let u = 0; u < n; u++) {
      if (assign[u] !== -1) continue;
      const dom = candidateDomain(g1, g2, u, assign, used, initialDomains[u]);
      if (dom.length === 0) return true; // 前向检查失败：该分支无解
      if (pick === -1 || dom.length < pickDomain.length ||
        (dom.length === pickDomain.length && degree(g1, u) > degree(g1, pick))) {
        pick = u;
        pickDomain = dom;
      }
    }
    if (pick === -1) return true;

    for (const w of pickDomain) {
      assign[pick] = w;
      used[w] = true;
      const cont = dfs(assigned + 1);
      used[w] = false;
      assign[pick] = -1;
      if (!cont || state.budgetExceeded) return false;
      if (stopAfter !== undefined && count >= stopAfter) return false;
    }
    return true;
  };

  dfs(0);
  return finish(mappings, count, !state.budgetExceeded, state, start);
}

/**
 * 跨图可比的细化签名：稳定细化类中各类邻居的数量多集，
 * 加上自身固定颜色与度数。类号本身依赖迭代编号，故用其结构签名。
 */
function refinedSignature(g: GraphData, classes: number[], v: number): string {
  const neighborClassCount = new Map<number, number>();
  for (let w = 0; w < g.n; w++) {
    if (g.adj[v][w]) neighborClassCount.set(classes[w], (neighborClassCount.get(classes[w]) ?? 0) + 1);
  }
  const neigh = [...neighborClassCount.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([c, k]) => `${c}:${k}`)
    .join(",");
  return `${g.colors[v]}|d${degree(g, v)}|{${neigh}}`;
}

function candidateDomain(
  g1: GraphData,
  g2: GraphData,
  u: number,
  assign: number[],
  used: boolean[],
  base: number[],
): number[] {
  const dom: number[] = [];
  outer: for (const w of base) {
    if (used[w]) continue;
    if (g1.colors[u] !== g2.colors[w]) continue;
    // 与所有已赋值顶点的邻接关系必须一致。
    for (let x = 0; x < g1.n; x++) {
      if (assign[x] === -1) continue;
      if (g1.adj[u][x] !== g2.adj[w][assign[x]]) continue outer;
    }
    dom.push(w);
  }
  return dom;
}

function finish(
  mappings: number[][],
  count: bigint,
  complete: boolean,
  state: SearchState,
  start: number,
): SolveOutcome {
  return {
    mappings,
    count,
    complete,
    nodesSearched: state.nodes,
    elapsedMs: Date.now() - start,
    budgetExceeded: state.budgetExceeded,
  };
}
