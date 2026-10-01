import { GraphInput } from "../src/types.js";

/** 路径图 P_n。 */
export function pathGraph(n: number): GraphInput {
  const edges = [];
  for (let i = 0; i + 1 < n; i++) edges.push({ u: i, v: i + 1 });
  return { n, edges };
}

/** 环 C_n。 */
export function cycleGraph(n: number): GraphInput {
  if (n === 1) return { n: 1 };
  const edges = [];
  for (let i = 0; i < n; i++) edges.push({ u: i, v: (i + 1) % n });
  return { n, edges };
}

/** 完全图 K_n。 */
export function completeGraph(n: number): GraphInput {
  const edges = [];
  for (let u = 0; u < n; u++) for (let v = u + 1; v < n; v++) edges.push({ u, v });
  return { n, edges };
}

/** 星形 K_{1,k}，中心为顶点 0。 */
export function starGraph(k: number): GraphInput {
  const edges = [];
  for (let i = 1; i <= k; i++) edges.push({ u: 0, v: i });
  return { n: k + 1, edges };
}

/** 完全二分图 K_{a,b}：0..a-1 与 a..a+b-1 全连。 */
export function completeBipartite(a: number, b: number): GraphInput {
  const edges = [];
  for (let i = 0; i < a; i++) for (let j = a; j < a + b; j++) edges.push({ u: i, v: j });
  return { n: a + b, edges };
}

/** 三棱柱图：两个三角形 0,1,2 与 3,4,5，对应顶点相连。 */
export function triangularPrism(): GraphInput {
  return {
    n: 6,
    edges: [
      { u: 0, v: 1 }, { u: 1, v: 2 }, { u: 2, v: 0 },
      { u: 3, v: 4 }, { u: 4, v: 5 }, { u: 5, v: 3 },
      { u: 0, v: 3 }, { u: 1, v: 4 }, { u: 2, v: 5 },
    ],
  };
}

/** 随机但确定的伪随机数。 */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 枚举所有可能边集合，生成 n 顶点全部简单无向标号图。 */
export function allLabeledGraphs(n: number): GraphInput[] {
  const pairs: Array<[number, number]> = [];
  for (let u = 0; u < n; u++) for (let v = u + 1; v < n; v++) pairs.push([u, v]);
  const total = 1 << pairs.length;
  const result: GraphInput[] = [];
  for (let mask = 0; mask < total; mask++) {
    const edges = [];
    for (let i = 0; i < pairs.length; i++) {
      if (mask & (1 << i)) {
        const [u, v] = pairs[i];
        edges.push({ u, v });
      }
    }
    result.push({ n, edges });
  }
  return result;
}

export function randomGraph(n: number, rng: () => number, p = 0.5): GraphInput {
  const edges = [];
  for (let u = 0; u < n; u++) {
    for (let v = u + 1; v < n; v++) {
      if (rng() < p) edges.push({ u, v });
    }
  }
  return { n, edges };
}

/** 对 [0..n-1] 应用置换：perm[i] = i 的新位置。返回重排后的图。 */
export function permuteGraph(g: GraphInput, perm: number[]): GraphInput {
  const edges = (g.edges ?? []).map(({ u, v }) => ({ u: perm[u], v: perm[v] }));
  const colors: Record<number, string> = {};
  for (const [k, c] of Object.entries(g.colors ?? {})) colors[perm[Number(k)]] = c;
  return { n: g.n, edges, colors };
}

export function randomPermutation(n: number, rng: () => number): number[] {
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return perm;
}

/** 暴力枚举所有 n! 置换，返回保色同构双射数量。 */
import { buildGraph } from "../src/graph.js";
import { verifyBijection } from "../src/graph.js";

export function bruteForceIsoCount(g1Input: GraphInput, g2Input: GraphInput): bigint {
  const g1 = buildGraph(g1Input);
  const g2 = buildGraph(g2Input);
  if (g1.n !== g2.n) return 0n;
  const n = g1.n;
  const perm = Array.from({ length: n }, (_, i) => i);
  let count = 0n;
  const enumerate = (k: number) => {
    if (k === n) {
      if (verifyBijection(g1, g2, perm).valid) count++;
      return;
    }
    for (let i = k; i < n; i++) {
      [perm[k], perm[i]] = [perm[i], perm[k]];
      enumerate(k + 1);
      [perm[k], perm[i]] = [perm[i], perm[k]];
    }
  };
  enumerate(0);
  return count;
}
