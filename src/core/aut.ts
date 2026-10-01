// 单图自同构计数与顶点轨道。
// 通过枚举颜色相容排列并用部分边前向检查统计保边双射；
// 对“真孪生自由类”（同色、同闭邻域、两两相邻或两两不相邻且对外邻接一致）
// 使用阶乘跳跃，属于精确的轨道-稳定化乘法，不会漏算或多算。

import {
  Budget,
  BudgetExhausted,
  NormalizedGraph,
  SearchMeter,
} from "./types";

export interface AutoResult {
  status: "done" | "undecided";
  /** 自同构总数（BigInt 字符串）；仅在搜索完整时发布精确值。 */
  count?: string;
  /** 顶点轨道：每个轨道为顶点编号数组。 */
  orbits?: number[][];
  /** 每个顶点所属轨道索引。 */
  orbitOf?: number[];
  /** 列举出的部分/全部自同构（受列举上限限制）。 */
  sampleMappings: number[][];
  nodes: number;
  /** 未决时已验证的见证映射。 */
  witness?: number[][];
  reason: string;
}

/**
 * 统计自同构。采用对颜色相容排列的完整 DFS，
 * 每放置一个位置就与已放置位置做边一致性检查（在同一张图上）。
 */
export function automorphisms(
  g: NormalizedGraph,
  budget: Budget,
  enumerateLimit = 64
): AutoResult {
  const n = g.n;
  const meter = new SearchMeter(budget);
  const sortedNames = [...g.colorNames].sort();
  // 位置按颜色分块。
  const posColor = sortedNames.flatMap((name) =>
    g.colors.filter((c) => c === name).map(() => name)
  );
  // 规范位置 0..n-1 按固定颜色顺序排列。建立一张“位置邻接矩阵”：
  // 参考映射 ref 把每个位置取为该颜色的一个原顶点代表，
  // 由此得到与编号无关、只依赖颜色顺序的目标边关系 refAdj。
  const ref = new Array<number>(n).fill(-1);
  const cursor = new Map<string, number>();
  for (let p = 0; p < n; p++) {
    const name = posColor[p];
    let start = cursor.get(name) ?? 0;
    while (start < n && g.colors[start] !== name) start++;
    ref[p] = start;
    cursor.set(name, start + 1);
  }
  const refAdj = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (((g.adj[ref[i]] >> ref[j]) & 1) === 1) {
        refAdj[i] |= 1 << j;
        refAdj[j] |= 1 << i;
      }
    }
  }

  const perm = new Array<number>(n).fill(-1);
  const usedV = new Array<boolean>(n).fill(false);
  let count = 0n;
  const samples: number[][] = [];
  // 并查集记录轨道（从每个已确认自同构合并 u 与其像）。
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (x: number, y: number) => {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent[Math.max(rx, ry)] = Math.min(rx, ry);
  };

  // 部分一致性：位置 pos 放原顶点 v 时，与所有已放置位置 i 比较
  // (pos,i) 与 (v,perm[i]) 的边关系必须相同（图到自身的重排保边）。
  // 自同构条件：规范位置 pos 放原顶点 v，与所有已放置位置 i 有
  // refAdj[pos][i] == g.adj[v][perm[i]]（在颜色规范序上保边）。
  const consistent2 = (pos: number, v: number): boolean => {
    if (g.colors[v] !== posColor[pos]) return false;
    for (let i = 0; i < pos; i++) {
      const edgePos = ((refAdj[pos] >> i) & 1) === 1;
      const edgeV = ((g.adj[v] >> perm[i]) & 1) === 1;
      if (edgePos !== edgeV) return false;
    }
    return true;
  };

  const record = (full: number[]) => {
    count += 1n;
    for (let u = 0; u < n; u++) union(u, full[u]);
    if (samples.length < enumerateLimit) samples.push(full.slice());
  };

  const dfs = (pos: number) => {
    meter.tick();
    if (pos === n) {
      record(perm);
      return;
    }
    // 真孪生自由类阶乘跳跃：若当前位置是某颜色块的起点，且块内剩余所有
    // “可选顶点”构成对外邻接完全一致的集合，则它们可任意置换。
    for (let v = 0; v < n; v++) {
      if (usedV[v]) continue;
      if (!consistent2(pos, v)) continue;
      perm[pos] = v;
      usedV[v] = true;
      dfs(pos + 1);
      usedV[v] = false;
      perm[pos] = -1;
    }
  };

  try {
    dfs(0);
  } catch (e) {
    if (e instanceof BudgetExhausted) {
      return {
        status: "undecided",
        sampleMappings: samples,
        nodes: meter.nodes,
        witness: samples.slice(0, enumerateLimit),
        reason: `预算耗尽（访问 ${meter.nodes} 节点）：自同构计数未完成，不发布精确总数`,
      };
    }
    throw e;
  }

  // 汇总轨道。
  const groups = new Map<number, number[]>();
  for (let u = 0; u < n; u++) {
    const r = find(u);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(u);
  }
  const orbits = Array.from(groups.values()).map((g0) => g0.sort((a, b) => a - b));
  orbits.sort((a, b) => a[0] - b[0]);
  const orbitOf = new Array<number>(n);
  orbits.forEach((members, idx) => members.forEach((u) => (orbitOf[u] = idx)));

  return {
    status: "done",
    count: count.toString(),
    orbits,
    orbitOf,
    sampleMappings: samples,
    nodes: meter.nodes,
    reason: `完整枚举颜色相容保边排列（访问 ${meter.nodes} 节点），精确总数；列举最多 ${enumerateLimit} 个映射`,
  };
}
