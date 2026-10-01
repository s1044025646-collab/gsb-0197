// 独立暴力参照实现：直接枚举所有置换，不使用生产搜索代码。
// 用于在 n<=6 上交叉核对同构判断、自同构数与轨道。

import { NormalizedGraph } from "../core/types";

export function allPermutations(n: number): number[][] {
  if (n === 0) return [[]];
  const out: number[][] = [];
  const rec = (prefix: number[], used: boolean[]) => {
    if (prefix.length === n) {
      out.push(prefix.slice());
      return;
    }
    for (let v = 0; v < n; v++) {
      if (used[v]) continue;
      used[v] = true;
      prefix.push(v);
      rec(prefix, used);
      prefix.pop();
      used[v] = false;
    }
  };
  rec([], new Array(n).fill(false));
  return out;
}

/** 暴力枚举自同构（保颜色保边双射）。 */
export function bruteAutomorphisms(g: NormalizedGraph): number[][] {
  const result: number[][] = [];
  const n = g.n;
  for (const p of allPermutations(n)) {
    let ok = true;
    for (let u = 0; u < n && ok; u++) {
      if (g.colors[u] !== g.colors[p[u]]) {
        ok = false;
        break;
      }
      for (let v = u + 1; v < n; v++) {
        const e1 = ((g.adj[u] >> v) & 1) === 1;
        const e2 = ((g.adj[p[u]] >> p[v]) & 1) === 1;
        if (e1 !== e2) {
          ok = false;
          break;
        }
      }
    }
    if (ok) result.push(p);
  }
  return result;
}

/** 暴力判断 a->b 是否存在保颜色同构。 */
export function bruteIsomorphic(a: NormalizedGraph, b: NormalizedGraph): number[] | null {
  if (a.n !== b.n) return null;
  for (const p of allPermutations(a.n)) {
    let ok = true;
    for (let u = 0; u < a.n && ok; u++) {
      if (a.colors[u] !== b.colors[p[u]]) {
        ok = false;
        break;
      }
      for (let v = u + 1; v < a.n; v++) {
        const e1 = ((a.adj[u] >> v) & 1) === 1;
        const e2 = ((b.adj[p[u]] >> p[v]) & 1) === 1;
        if (e1 !== e2) {
          ok = false;
          break;
        }
      }
    }
    if (ok) return p;
  }
  return null;
}

/** 由自同构列表计算轨道（并查集）。 */
export function orbitsFrom(autos: number[][], n: number): number[][] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (const p of autos) {
    for (let u = 0; u < n; u++) {
      const a = find(u);
      const b = find(p[u]);
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  }
  const groups = new Map<number, number[]>();
  for (let u = 0; u < n; u++) {
    const r = find(u);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(u);
  }
  return Array.from(groups.values()).map((g0) => g0.sort((x, y) => x - y));
}
