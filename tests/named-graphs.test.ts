import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, verifyBijection } from "../src/graph.js";
import { checkIsomorphism, analyzeAutomorphisms } from "../src/service.js";
import { canonicalLabel } from "../src/canonical.js";
import {
  pathGraph, cycleGraph, completeGraph, starGraph, completeBipartite,
  triangularPrism, permuteGraph, randomPermutation, mulberry,
} from "./helpers.js";

const bigBudget = { maxNodes: 50_000_000, maxMs: 30_000, maxMappings: 10000 };

test("路径、环、完全图、星形的自同构数", () => {
  assert.equal(analyzeAutomorphisms(buildGraph(pathGraph(5)), bigBudget).automorphismCount, "2");
  assert.equal(analyzeAutomorphisms(buildGraph(cycleGraph(6)), bigBudget).automorphismCount, "12");
  assert.equal(analyzeAutomorphisms(buildGraph(completeGraph(5)), bigBudget).automorphismCount, "120");
  assert.equal(analyzeAutomorphisms(buildGraph(starGraph(4)), bigBudget).automorphismCount, "24");
});

test("两个相同不连通分量：P3 ⊔ P3 的自同构数 = 2!·2^2 = 8", () => {
  const g = {
    n: 6,
    edges: [
      { u: 0, v: 1 }, { u: 1, v: 2 },
      { u: 3, v: 4 }, { u: 4, v: 5 },
    ],
  };
  const result = analyzeAutomorphisms(buildGraph(g), bigBudget);
  assert.equal(result.automorphismCount, "8");
  assert.equal(result.orbits.length, 2); // 端点轨道、中点轨道
});

test("空图与孤立点语义：n=0 一个自同构；3 孤立点 3! 个", () => {
  assert.equal(analyzeAutomorphisms(buildGraph({ n: 0 }), bigBudget).automorphismCount, "1");
  assert.equal(analyzeAutomorphisms(buildGraph({ n: 3, edges: [] }), bigBudget).automorphismCount, "6");
});

test("三棱柱 与 K3,3：度数均为 3、细化难区分，但不同构", () => {
  const prism = buildGraph(triangularPrism());
  const k33 = buildGraph(completeBipartite(3, 3));
  const result = checkIsomorphism(prism, k33, bigBudget);
  assert.equal(result.status, "non-isomorphic");
  // 三棱柱含三角形，K3,3 不含——理由中搜索必须穷尽。
  assert.match(result.reason, /穷尽/);
  // 各自同构于自身。
  assert.equal(checkIsomorphism(prism, prism, bigBudget).status, "isomorphic");
  // 三棱柱自同构群大小为 12（D3h 的顶点置换）。
  assert.equal(analyzeAutomorphisms(prism, bigBudget).automorphismCount, "12");
  // K3,3 自同构群 = 2 * 3! * 3! = 72。
  assert.equal(analyzeAutomorphisms(k33, bigBudget).automorphismCount, "72");
});

test("颜色破坏对称性：C4 全染为 8，两顶点同色为 4，相邻异色为 1", () => {
  const plain = analyzeAutomorphisms(buildGraph(cycleGraph(4)), bigBudget);
  assert.equal(plain.automorphismCount, "8");
  const colored = analyzeAutomorphisms(
    buildGraph({ ...cycleGraph(4), colors: { 0: "red", 2: "red" } }),
    bigBudget,
  );
  assert.equal(colored.automorphismCount, "4");
  const adjacent = analyzeAutomorphisms(
    buildGraph({ ...cycleGraph(4), colors: { 0: "red", 1: "blue" } }),
    bigBudget,
  );
  assert.equal(adjacent.automorphismCount, "1");
  // 颜色名固定："red" 与 "blue" 不被自动合并。
  const renamed = analyzeAutomorphisms(
    buildGraph({ ...cycleGraph(4), colors: { 0: "blue", 1: "blue", 2: "blue", 3: "blue" } }),
    bigBudget,
  );
  assert.equal(renamed.automorphismCount, "8");
  const cross = checkIsomorphism(
    buildGraph({ ...cycleGraph(4), colors: { 0: "red" } }),
    buildGraph({ ...cycleGraph(4), colors: { 0: "blue" } }),
    bigBudget,
  );
  assert.equal(cross.status, "non-isomorphic");
});

test("规范表示对任意输入编号重排不变，且不含原编号语义", () => {
  const rng = mulberry(42);
  for (const base of [pathGraph(6), triangularPrism(), completeBipartite(2, 3)]) {
    const c0 = canonicalLabel(buildGraph(base), bigBudget);
    for (let t = 0; t < 5; t++) {
      const perm = randomPermutation(base.n, rng);
      const c1 = canonicalLabel(buildGraph(permuteGraph(base, perm)), bigBudget);
      assert.equal(c1.status, "proved");
      assert.equal(c1.canonical, c0.canonical);
    }
  }
  // 非同构（非色）图规范码不同。
  assert.notEqual(
    canonicalLabel(buildGraph(pathGraph(4)), bigBudget).canonical,
    canonicalLabel(buildGraph(starGraph(3)), bigBudget).canonical,
  );
});

test("伪造双射被拒绝；真双射通过", () => {
  const g1 = buildGraph(pathGraph(4));
  const g2 = buildGraph(cycleGraph(4));
  // 看似保色的双射（全默认色），但边结构不一致。
  const fake = [0, 1, 2, 3];
  const result = checkIsomorphism(g1, g2, bigBudget);
  assert.equal(result.status, "non-isomorphic");
  // 直接核验接口必须拒绝伪造映射。
  assert.equal(verifyBijection(g1, g2, fake).valid, false);
  // 同构图的真映射通过。
  const rng = mulberry(7);
  const perm = randomPermutation(4, rng);
  const reordered = buildGraph(permuteGraph(pathGraph(4), perm));
  // mapping[old] = newPos 即为 g1 -> reordered 的双射。
  assert.equal(verifyBijection(g1, reordered, perm).valid, true);
});
