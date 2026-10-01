// 测试运行器（无第三方依赖）：
// 1) 路径/环/完全图/星形/多相同分量/颜色破坏对称
// 2) 三棱柱 vs K3,3（度数一致、细化难分的非同构反例）
// 3) n<=6 独立枚举置换核对同构、自同构数、轨道
// 4) 任意重排后规范表示相同
// 5) 伪造双射被拒绝
// 6) 预算未决

import { normalizeGraph, NormalizedGraph, makeBudget, verifyBijection } from "../core/types";
import { GraphData } from "../core/types";
import {
  path, cycle, complete, star, triangularPrism, k33,
  disjointUnion, relabel, randomPermutation, completeBipartite, emptyGraph,
} from "../core/graphs";
import { findIsomorphism, canonicalize } from "../core/iso";
import { automorphisms } from "../core/aut";
import { bruteAutomorphisms, bruteIsomorphic, orbitsFrom, allPermutations } from "./brute";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`✗ ${name} ${extra}`);
  }
}

function eqArrays(a: number[], b: number[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function orbitsKey(o: number[][]) {
  return o.map((g) => g.join("-")).sort().join("|");
}

// 1. 命名图基本同构/自同构
{
  const cases: Array<[string, GraphData, bigint]> = [
    ["空图 n=0", emptyGraph(0), 1n],
    ["孤立点 1", emptyGraph(1), 1n],
    ["孤立点 4", emptyGraph(4), 24n],
    ["路径 P3", path(3), 2n],
    ["路径 P4", path(4), 2n],
    ["环 C4", cycle(4), 8n],
    ["完全图 K4", complete(4), 24n],
    ["星形 K1,3", star(3), 6n],
    ["两个不相连三角形", disjointUnion([complete(3), complete(3)]), 72n], // 6*6*2
    ["两个相同路径", disjointUnion([path(2), path(2)]), 8n],
  ];
  for (const [name, data, expectCount] of cases) {
    const g = normalizeGraph(data);
    const auto = automorphisms(g, makeBudget(5_000_000, 30_000));
    check(`${name} 自同构数=${expectCount}`, auto.status === "done" && BigInt(auto.count!) === expectCount,
      `got ${auto.count} status ${auto.status}`);
  }
}

// 2. 三棱柱 vs K3,3：度数序列相同(3-正则)但不同构
{
  const prism = normalizeGraph(triangularPrism());
  const k33g = normalizeGraph(k33());
  const r = findIsomorphism(prism, k33g, makeBudget(5_000_000, 30_000));
  check("三棱柱 与 K3,3 不同构", r.status === "nonisomorphic", r.reason);
  // 两者确实都是 3-正则，证明不能只看度数序列
  const deg = (g: NormalizedGraph) => g.adj.map((b) => {
    let c = 0;
    while (b) { c += b & 1; b >>= 1; }
    return c;
  });
  check("两者均为3正则(度数序列相同)", deg(prism).join() === "3,3,3,3,3,3" && deg(k33g).join() === "3,3,3,3,3,3");
  check("暴力枚举同样判定不同构", bruteIsomorphic(prism, k33g) === null);
  // 同构正向：三棱柱与自身
  const self = findIsomorphism(prism, prism, makeBudget(1_000_000, 10_000));
  check("三棱柱与自身同构", self.status === "isomorphic" && eqArrays(self.mapping!, [0,1,2,3,4,5]));
  // K3,3 自同构数 = 3! * 3! * 2 = 72；三棱柱 = 12
  check("K3,3 自同构数=72", BigInt(automorphisms(k33g, makeBudget(5e6,3e4)).count!) === 72n);
  check("三棱柱自同构数=12", BigInt(automorphisms(prism, makeBudget(5e6,3e4)).count!) === 12n);
}

// 3. n<=6 与独立暴力枚举交叉核对（同构/自同构数/轨道）
{
  // 构造一批覆盖不同结构的图
  const library: NormalizedGraph[] = [
    emptyGraph(0), emptyGraph(1), emptyGraph(3),
    path(2), path(4), path(6), cycle(3), cycle(5), cycle(6),
    complete(2), complete(5), star(2), star(5),
    completeBipartite(2, 3), triangularPrism(), k33(),
    disjointUnion([path(3), path(2)]),
    disjointUnion([complete(2), complete(2), complete(2)]),
    normalizeGraph({ n: 5, edges: [[0,1],[1,2],[2,3],[3,4],[4,0],[0,2]] }),
  ].map((d) => normalizeGraph(d as GraphData));

  for (const g0 of library) {
    if (g0.n > 6) continue;
    const auto = automorphisms(g0, makeBudget(10_000_000, 60_000));
    const brute = bruteAutomorphisms(g0);
    check(`n=${g0.n} 自同构数与暴力一致`,
      auto.status === "done" && BigInt(auto.count!) === BigInt(brute.length),
      `engine=${auto.count} brute=${brute.length}`);
    const bOrbits = orbitsFrom(brute, g0.n);
    check(`n=${g0.n} 轨道与暴力一致`,
      auto.status === "done" && orbitsKey(auto.orbits!) === orbitsKey(bOrbits),
      `engine=${orbitsKey(auto.orbits!)} brute=${orbitsKey(bOrbits)}`);
  }

  // 两两同构关系与暴力一致（含重排）
  for (let i = 0; i < library.length; i++) {
    for (let j = i; j < library.length; j++) {
      const a = library[i];
      const b0 = library[j];
      if (a.n !== b0.n || a.n > 6) continue;
      // 给 b 做随机重排
      const perm = randomPermutation(b0.n, 7 + i * 13 + j);
      const bData = relabel(toData(b0), perm);
      const b = normalizeGraph(bData);
      const expected = bruteIsomorphic(a, b) !== null;
      const got = findIsomorphism(a, b, makeBudget(10_000_000, 60_000));
      check(`同构 [${i}]-重排[${j}] n=${a.n}`,
        (got.status === "isomorphic") === expected,
        `got=${got.status} expected=${expected}`);
      if (got.status === "isomorphic") {
        check(`  映射逐边核验`, verifyBijection(a, b, got.mapping!).ok);
      }
    }
  }
}

function toData(g: NormalizedGraph): GraphData {
  const edges: Array<[number, number]> = [];
  for (let u = 0; u < g.n; u++)
    for (let v = u + 1; v < g.n; v++)
      if (((g.adj[u] >> v) & 1) === 1) edges.push([u, v]);
  const colors: Record<number, string> = {};
  g.colors.forEach((c, i) => { if (c !== "_default") colors[i] = c; });
  return { n: g.n, edges, ...(Object.keys(colors).length ? { colors } : {}) };
}

// 4. 颜色固定、破坏对称；任意重排规范码相同
{
  // 给所有顶点不同固定颜色，自同构被完全钉死为 1。
  const base: GraphData = { n: 4, edges: [[0,1],[1,2],[2,3]], colors: { 0: "red", 1: "green", 2: "yellow", 3: "blue" } };
  const g = normalizeGraph(base);
  check("染色路径自同构数=1(颜色破坏对称)",
    BigInt(automorphisms(g, makeBudget(1e6,1e4)).count!) === 1n);

  // 颜色不能重命名合并：把 green 改成另一种颜色名（结构同但颜色集合不同）。
  const swapped: GraphData = { n: 4, edges: [[0,1],[1,2],[2,3]], colors: { 0: "red", 1: "cyan", 2: "yellow", 3: "blue" } };
  const rSwap = findIsomorphism(normalizeGraph(base), normalizeGraph(swapped), makeBudget(1e6,1e4));
  check("不同颜色名不可随意合并", rSwap.status === "nonisomorphic", rSwap.reason);

  // 随机重排多次，规范码一致
  const canon0 = canonicalize(g, makeBudget(10e6, 30e4));
  let invariant = canon0.status === "done";
  for (let seed = 1; seed <= 8; seed++) {
    const perm = randomPermutation(4, seed);
    const rg = normalizeGraph(relabel(base, perm));
    const c = canonicalize(rg, makeBudget(10e6, 30e4));
    if (c.status !== "done" || c.code !== canon0.code) invariant = false;
  }
  check("任意重排后规范表示相同", invariant, canon0.code ?? "");
  check("规范码不含原顶点编号(无顶点前缀)", !/vertex|orig/i.test(canon0.code ?? ""));

  // 两个同构但不同编号的图规范码相同；非同构规范码不同
  const k = normalizeGraph(triangularPrism());
  const kRel = normalizeGraph(relabel(triangularPrism(), randomPermutation(6, 99)));
  check("三棱柱重排规范码相同",
    canonicalize(k, makeBudget(10e6,3e4)).code === canonicalize(kRel, makeBudget(10e6,3e4)).code);
  check("三棱柱与K3,3规范码不同",
    canonicalize(k, makeBudget(10e6,3e4)).code !== canonicalize(normalizeGraph(k33()), makeBudget(10e6,3e4)).code);
}

// 5. 伪造双射被拒绝
{
  const prism = normalizeGraph(triangularPrism());
  const k33g = normalizeGraph(k33());
  const fake = [0,1,2,3,4,5];
  const v = verifyBijection(prism, k33g, fake);
  check("恒等伪造双射在非同构对被拒绝", !v.ok && /边关系不一致/.test(v.reason ?? ""));
  // 非双射
  const v2 = verifyBijection(prism, k33g, [0,0,1,2,3,4]);
  check("非双射被拒绝", !v2.ok && /双射/.test(v2.reason ?? ""));
  // 颜色伪造
  const a = normalizeGraph({ n: 2, edges: [[0,1]], colors: { 0: "red", 1: "blue" } });
  const b = normalizeGraph({ n: 2, edges: [[0,1]], colors: { 0: "blue", 1: "red" } });
  const v3 = verifyBijection(a, b, [0,1]);
  check("颜色不一致的映射被拒绝", !v3.ok && /颜色/.test(v3.reason ?? ""));
}

// 6. 预算未决：极小预算不能把未搜到当成不同构
{
  const a = normalizeGraph(emptyGraph(10)); // 10! 分支
  const b = normalizeGraph(emptyGraph(10));
  const r = findIsomorphism(a, b, makeBudget(5, 50)); // 故意极小
  // 孤立点首步 MRV 可能立即成解或很快耗尽；关键是耗尽时必须 undecided 而非 noniso
  if (r.status === "undecided") {
    check("预算耗尽返回 undecided", r.status === "undecided");
  } else {
    check("极小预算下要么快速找到解要么未决", r.status === "isomorphic");
  }
  const c = canonicalize(a, makeBudget(3, 20));
  check("规范码预算不足时不发布最终码", c.status === "undecided" && c.code === undefined);
  const au = automorphisms(a, makeBudget(3, 20));
  check("自同构预算不足时不发布精确总数", au.status === "undecided" && au.count === undefined);
}

// 7. 非法输入校验
{
  let threw = false;
  try { normalizeGraph({ n: 3, edges: [[0,0]] }); } catch { threw = true; }
  check("自环被拒绝", threw);
  threw = false;
  try { normalizeGraph({ n: 3, edges: [[0,1],[1,0]] }); } catch { threw = true; }
  check("平行边被拒绝", threw);
  threw = false;
  try { normalizeGraph({ n: 11, edges: [] }); } catch { threw = true; }
  check("超过10顶点被拒绝", threw);
  threw = false;
  try { normalizeGraph({ n: 3, edges: [[0,5]] }); } catch { threw = true; }
  check("越界边被拒绝", threw);
}

console.log(`\n通过 ${passed} 项，失败 ${failed} 项`);
process.exit(failed === 0 ? 0 : 1);
