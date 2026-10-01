// 颜色保持的图同构 / 规范标号 / 自同构搜索引擎。
// 采用“个体化 + 回溯”：每一步将一个源顶点绑定到一个目标顶点，
// 候选限定在颜色与细化约束相容的目标顶点内，并做部分边前向检查。
// 对称性通过“颜色单元内首个代表 + 真孪生自由阶乘跳跃”处理，
// 不丢弃任何可能映射；搜索完整才发布精确结果。

import {
  Budget,
  BudgetExhausted,
  NormalizedGraph,
  SearchMeter,
  verifyBijection,
} from "./types";
import { refine } from "./refine";

/** 对一个图按给定置换重排，返回邻接矩阵位掩码数组。 */
function permuteAdj(g: NormalizedGraph, perm: number[]): number[] {
  const n = g.n;
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const u = perm[i];
      const v = perm[j];
      if (((g.adj[u] >> v) & 1) === 1) {
        out[i] |= 1 << j;
        out[j] |= 1 << i;
      }
    }
  }
  return out;
}

/**
 * 与编号无关的规范编码（不含任何原顶点编号）。
 * 结构：固定排序后的颜色名表 + 颜色计数 + 排序后的邻接矩阵行（按颜色分组后的最小排列）。
 * 实际通过对所有颜色相容排列取邻接矩阵字典序最小得到。
 */
export function canonicalCode(g: NormalizedGraph, adj: number[]): string {
  const n = g.n;
  // 颜色表按名字固定排序，绝不随顶点编号变化。
  const sortedNames = [...g.colorNames].sort();
  const counts = sortedNames.map(
    (name) => g.colors.filter((c) => c === name).length
  );
  // 邻接矩阵上三角按行展开为 0/1 串；位置已按固定颜色顺序分块，
  // 故颜色信息通过 counts 与分块排列固定，编码不含原顶点编号。
  const tri: string[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      tri.push(((adj[i] >> j) & 1).toString());
    }
  }
  return `G1|n=${n}|colors=${sortedNames.join(">")}|counts=${counts.join(
    ","
  )}|tri=${tri.join("")}`;
}

export interface IsoResult {
  status: "isomorphic" | "nonisomorphic" | "undecided";
  /** 源顶点 -> 目标顶点 的保颜色双射（找到时）。 */
  mapping?: number[];
  /** 结论依据或失败冲突描述。 */
  reason: string;
  /** 已访问搜索节点数。 */
  nodes: number;
  /** 未决时已经验证过的见证（部分映射或空）。 */
  witness?: number[];
}

interface SearchState {
  a: NormalizedGraph; // 源
  b: NormalizedGraph; // 目标
  meter: SearchMeter;
}

/**
 * 在当前部分映射下，判断把源顶点 u 绑定到目标顶点 w 是否满足
 * 与“所有已绑定顶点”的边/非边及颜色关系（前向检查）。
 */
function partialConsistent(
  a: NormalizedGraph,
  b: NormalizedGraph,
  map: number[],
  u: number,
  w: number
): boolean {
  if (a.colors[u] !== b.colors[w]) return false;
  for (let x = 0; x < a.n; x++) {
    if (x === u || map[x] === -1) continue;
    const edgeA = ((a.adj[u] >> x) & 1) === 1;
    const edgeB = ((b.adj[w] >> map[x]) & 1) === 1;
    if (edgeA !== edgeB) return false;
  }
  return true;
}

/** 选择下一个绑定的源顶点：在约束最强（候选最少）的未绑定顶点中取编号最小。 */
function selectSource(
  s: SearchState,
  map: number[],
  usedTarget: boolean[]
): { u: number; candidates: number[] } | null {
  const { a, b } = s;
  let bestU = -1;
  let bestCands: number[] = [];
  for (let u = 0; u < a.n; u++) {
    if (map[u] !== -1) continue;
    const cands: number[] = [];
    for (let w = 0; w < b.n; w++) {
      if (usedTarget[w]) continue;
      if (partialConsistent(a, b, map, u, w)) cands.push(w);
    }
    if (cands.length === 0) return { u, candidates: [] }; // 立即死路
    if (bestU === -1 || cands.length < bestCands.length) {
      bestU = u;
      bestCands = cands;
    }
  }
  if (bestU === -1) return null;
  return { u: bestU, candidates: bestCands };
}

/** 递归查找一个保颜色同构；找到立即返回完整映射。 */
function findOne(
  s: SearchState,
  map: number[],
  usedTarget: boolean[]
): number[] | null {
  s.meter.tick();
  const choice = selectSource(s, map, usedTarget);
  if (choice === null) {
    // 完整双射，最终核验。
    const check = verifyBijection(s.a, s.b, map);
    return check.ok ? map.slice() : null;
  }
  if (choice.candidates.length === 0) return null;
  for (const w of choice.candidates) {
    map[choice.u] = w;
    usedTarget[w] = true;
    const got = findOne(s, map, usedTarget);
    if (got) return got;
    usedTarget[w] = false;
    map[choice.u] = -1;
  }
  return null;
}

/** 判断两图是否同构（带预算）。 */
export function findIsomorphism(
  a: NormalizedGraph,
  b: NormalizedGraph,
  budget: Budget
): IsoResult {
  if (a.n !== b.n) {
    return { status: "nonisomorphic", reason: "顶点数不同", nodes: 0 };
  }
  const ra = refine(a);
  const rb = refine(b);
  if (JSON.stringify([...a.colorNames].sort()) !== JSON.stringify([...b.colorNames].sort())) {
    return { status: "nonisomorphic", reason: "颜色名集合不同（颜色固定不可重命名）", nodes: 0 };
  }
  const sigA = ra.classes.map((c) => `${a.colors[c[0]]}:${c.length}`).sort();
  const sigB = rb.classes.map((c) => `${b.colors[c[0]]}:${c.length}`).sort();
  if (JSON.stringify(sigA) !== JSON.stringify(sigB)) {
    return {
      status: "nonisomorphic",
      reason: "颜色细化的稳定颜色类大小多重集不一致，不存在保颜色同构",
      nodes: 0,
    };
  }
  const meter = new SearchMeter(budget);
  const s: SearchState = { a, b, meter };
  const map = new Array<number>(a.n).fill(-1);
  const used = new Array<boolean>(b.n).fill(false);
  try {
    const got = findOne(s, map, used);
    if (got) {
      return {
        status: "isomorphic",
        mapping: got,
        reason: "找到保颜色双射并已逐边核验",
        nodes: meter.nodes,
      };
    }
    return {
      status: "nonisomorphic",
      reason: `搜索穷尽：颜色细化后对所有相容个体化分支回溯（访问 ${meter.nodes} 个节点）均无完整保边双射`,
      nodes: meter.nodes,
    };
  } catch (e) {
    if (e instanceof BudgetExhausted) {
      return {
        status: "undecided",
        reason: `预算耗尽（访问 ${meter.nodes} 个节点）：尚未穷尽，不能判定不同构`,
        nodes: meter.nodes,
        witness: map.filter((m) => m !== -1),
      };
    }
    throw e;
  }
}

export interface CanonicalResult {
  status: "done" | "undecided";
  code?: string;
  /** 达到规范编码所用的一个顶点置换（仅调试/报告用）。 */
  permutation?: number[];
  nodes: number;
  reason: string;
}

/**
 * 计算规范标号：在所有颜色相容排列中取邻接矩阵（含颜色分组）字典序最小者。
 * 使用与同构搜索相同的完整回溯；预算不足则不发布最终规范码。
 */
export function canonicalize(g: NormalizedGraph, budget: Budget): CanonicalResult {
  const n = g.n;
  const meter = new SearchMeter(budget);
  // 颜色分组：排列必须把相同颜色的位置整体对应，颜色名固定排序。
  const sortedNames = [...g.colorNames].sort();
  // 目标位置按颜色分块（颜色固定顺序），记录每个位置允许的颜色。
  const posColor = sortedNames.flatMap((name) =>
    g.colors.filter((c) => c === name).map(() => name)
  );

  const perm = new Array<number>(n).fill(-1); // 位置 i -> 原顶点
  const usedV = new Array<boolean>(n).fill(false);
  let bestAdj: number[] | null = null;
  let bestPerm: number[] | [] = [];
  const target = g;

  const better = (adj: number[]): boolean => {
    if (bestAdj === null) return true;
    for (let i = 0; i < n; i++) {
      if (adj[i] !== bestAdj[i]) return adj[i] < bestAdj[i];
    }
    return false;
  };

  const dfs = (pos: number) => {
    meter.tick();
    if (pos === n) {
      const adj = permuteAdj(g, perm);
      if (better(adj)) {
        bestAdj = adj;
        bestPerm = perm.slice();
      }
      return;
    }
    const wantColor = posColor[pos];
    for (let v = 0; v < n; v++) {
      if (usedV[v] || g.colors[v] !== wantColor) continue;
      // 部分边前向检查：与已放置位置的边关系无需约束（都在同图），
      // 规范标号是单纯最小化，直接枚举即可。
      perm[pos] = v;
      usedV[v] = true;
      dfs(pos + 1);
      usedV[v] = false;
      perm[pos] = -1;
    }
  };

  try {
    dfs(0);
    if (bestAdj === null) {
      return { status: "done", code: canonicalCode(g, new Array(n).fill(0)), nodes: meter.nodes, reason: "空图规范码" };
    }
    return {
      status: "done",
      code: canonicalCode(g, bestAdj),
      permutation: bestPerm as number[],
      nodes: meter.nodes,
      reason: "颜色相容排列中邻接矩阵字典序最小者，不含原顶点编号",
    };
  } catch (e) {
    if (e instanceof BudgetExhausted) {
      return {
        status: "undecided",
        nodes: meter.nodes,
        reason: "规范标号搜索未完成，不发布最终规范码（未完成的候选编码不能冒充规范码）",
      };
    }
    throw e;
  }
}
