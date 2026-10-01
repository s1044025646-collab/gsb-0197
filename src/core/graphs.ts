// 常用图构造、重编号与工具。

import { GraphData } from "./types";

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

export function emptyGraph(n: number): GraphData {
  return { n, edges: [] };
}

/** n 个顶点的路径 P_n。 */
export function path(n: number): GraphData {
  const edges: Array<[number, number]> = [];
  for (let i = 0; i + 1 < n; i++) edges.push([i, i + 1]);
  return { n, edges };
}

/** n 个顶点的环 C_n（n>=3）。 */
export function cycle(n: number): GraphData {
  if (n === 1 || n === 2) return path(n);
  const g = path(n);
  g.edges.push([0, n - 1]);
  return g;
}

/** 完全图 K_n。 */
export function complete(n: number): GraphData {
  const edges: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) edges.push([i, j]);
  return { n, edges };
}

/** 星形 K_{1,k}，中心为顶点 0。 */
export function star(k: number): GraphData {
  const edges: Array<[number, number]> = [];
  for (let i = 1; i <= k; i++) edges.push([0, i]);
  return { n: k + 1, edges };
}

/** 完全二部图 K_{a,b}，左部 0..a-1，右部 a..a+b-1。 */
export function completeBipartite(a: number, b: number): GraphData {
  const edges: Array<[number, number]> = [];
  for (let i = 0; i < a; i++) for (let j = a; j < a + b; j++) edges.push([i, j]);
  return { n: a + b, edges };
}

/** 三棱柱图（两个三角形对应相连），6 顶点 9 边。 */
export function triangularPrism(): GraphData {
  // 三角形 0-1-2，三角形 3-4-5，竖边 0-3,1-4,2-5
  const edges: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 0],
    [3, 4], [4, 5], [5, 3],
    [0, 3], [1, 4], [2, 5],
  ];
  return { n: 6, edges };
}

/** K_{3,3}，6 顶点 9 边，与三棱柱度数序列相同（全 3 正则）但不同构。 */
export function k33(): GraphData {
  return completeBipartite(3, 3);
}

/** 不相交并：多个相同/不同连通分量，自动偏移编号。 */
export function disjointUnion(parts: GraphData[]): GraphData {
  let n = 0;
  const edges: Array<[number, number]> = [];
  const colors: Record<number, string> = {};
  const defaults = new Set<string>();
  for (const p of parts) {
    const off = n;
    for (const [u, v] of p.edges) edges.push([u + off, v + off]);
    for (const [idx, name] of Object.entries(p.colors ?? {})) {
      colors[Number(idx) + off] = name;
    }
    if (p.defaultColor) defaults.add(p.defaultColor);
    n += p.n;
  }
  return {
    n,
    edges,
    ...(Object.keys(colors).length ? { colors } : {}),
    ...(defaults.size === 1 ? { defaultColor: Array.from(defaults)[0] } : {}),
  };
}

/**
 * 按给定置换重编号：newVertex = perm[oldVertex]（perm 为旧->新双射）。
 * 用于验证“规范表示与输入编号无关”。
 */
export function relabel(g: GraphData, perm: number[]): GraphData {
  if (perm.length !== g.n) throw new Error("置换长度与顶点数不符");
  const seen = new Set(perm);
  if (seen.size !== g.n || perm.some((x) => x < 0 || x >= g.n)) {
    throw new Error("重编号参数必须是顶点集上的一个置换");
  }
  const edges = g.edges.map(
    ([u, v]) => [perm[u], perm[v]].sort((a, b) => a - b) as [number, number]
  );
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const colors: Record<number, string> = {};
  for (const [idx, name] of Object.entries(g.colors ?? {})) {
    colors[perm[Number(idx)]] = name;
  }
  return {
    n: g.n,
    edges,
    ...(Object.keys(colors).length ? { colors } : {}),
    ...(g.defaultColor ? { defaultColor: g.defaultColor } : {}),
  };
}

/** 生成一个确定性伪随机置换（演示用，可传入种子）。 */
export function randomPermutation(n: number, seed = 1): number[] {
  let s = seed >>> 0;
  const rand = () => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s = s >>> 0;
    return s / 4294967296;
  };
  const perm = range(n);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return perm;
}
