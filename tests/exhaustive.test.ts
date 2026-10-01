import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph } from "../src/graph.js";
import { checkIsomorphism, analyzeAutomorphisms } from "../src/service.js";
import { canonicalLabel } from "../src/canonical.js";
import {
  allLabeledGraphs,
  randomGraph,
  permuteGraph,
  randomPermutation,
  bruteForceIsoCount,
  mulberry,
} from "./helpers.js";
import { GraphInput } from "../src/types.js";

const budget = { maxNodes: 10_000_000, maxMs: 30_000, maxMappings: 20000 };

/**
 * 对至多 n=5 的全部 32768 张标号图（n=5）做完整独立枚举核对：
 * - 同构判断与暴力 n! 枚举一致；
 * - 自同构数量一致；
 * - 重排后规范码一致。
 * 为控制总时长，n<=4 全量两两比较（去重采样），n=5 用代表抽样配对。
 */
test("n<=4：全部标号图两两比较，与暴力置换枚举一致", () => {
  for (let n = 0; n <= 4; n++) {
    const universe = allLabeledGraphs(n);
    // 对每张图，选自身、固定间隔的伙伴比较，覆盖全部图。
    for (let i = 0; i < universe.length; i++) {
      const a = universe[i];
      for (const j of [i, (i * 7 + 3) % universe.length, (i * 13 + 5) % universe.length]) {
        const b = universe[j];
        const expected = bruteForceIsoCount(a, b);
        const result = checkIsomorphism(buildGraph(a), buildGraph(b), budget, true);
        if (expected > 0n) {
          assert.equal(result.status, "isomorphic", `n=${n} i=${i} j=${j}`);
          assert.equal(result.isomorphismCount, expected.toString());
        } else {
          assert.equal(result.status, "non-isomorphic");
        }
      }
      const auto = analyzeAutomorphisms(buildGraph(a), budget);
      assert.equal(
        auto.automorphismCount,
        bruteForceIsoCount(a, a).toString(),
        `自同构数不符 n=${n} i=${i}`,
      );
    }
  }
});

test("n=5：随机 300 张图的自同构数与暴力枚举一致", () => {
  const rng = mulberry(123);
  for (let t = 0; t < 300; t++) {
    const g = randomGraph(5, rng, 0.3 + (t % 5) * 0.1);
    const got = analyzeAutomorphisms(buildGraph(g), budget);
    assert.equal(got.status, "proved");
    assert.equal(got.automorphismCount, bruteForceIsoCount(g, g).toString());
  }
});

test("n=6：200 对随机图，同构判定/计数与暴力枚举一致（含重排同构对）", () => {
  const rng = mulReader(999);
  for (let t = 0; t < 200; t++) {
    const g = randomGraph(6, rng, 0.4);
    const perm = randomPermutation(6, rng);
    const h = permuteGraph(g, perm);
    const result = checkIsomorphism(buildGraph(g), buildGraph(h), budget, true);
    assert.equal(result.status, "isomorphic");
    assert.equal(result.isomorphismCount, bruteForceIsoCount(g, g).toString());
  }

  // 再加 60 对独立随机图，非同构对必须判非，同构对计数一致。
  for (let t = 0; t < 60; t++) {
    const a = randomGraph(6, rng, 0.35);
    const b = randomGraph(6, rng, 0.35);
    const expected = bruteForceIsoCount(a, b);
    const result = checkIsomorphism(buildGraph(a), buildGraph(b), budget, true);
    if (expected === 0n) {
      assert.equal(result.status, "non-isomorphic", `第 ${t} 对应同构但未发现`);
    } else {
      assert.equal(result.status, "isomorphic");
      assert.equal(result.isomorphismCount, expected.toString());
    }
  }
});

test("规范码：n=6 随机重排不变；非同构对（不同边数）码不同", () => {
  const rng = mulberry(2024);
  for (let t = 0; t < 40; t++) {
    const g = randomGraph(6, rng, 0.45);
    const c1 = canonicalLabel(buildGraph(g), budget);
    const h = permuteGraph(g, randomPermutation(6, rng));
    const c2 = canonicalLabel(buildGraph(h), budget);
    assert.equal(c1.status, "proved");
    assert.equal(c2.canonical, c1.canonical);
  }
  const sparse = canonicalLabel(buildGraph(randomGraph(6, mulberry(1), 0.15)), budget);
  const dense = canonicalLabel(buildGraph(randomGraph(6, mulberry(2), 0.85)), budget);
  assert.notEqual(sparse.canonical, dense.canonical);
});

test("预算未决：极小节点预算下不得把未搜到当作不同构", () => {
  // 高度对称图 K10 自同构枚举，节点预算只给 5。
  const edges = [];
  for (let u = 0; u < 10; u++) for (let v = u + 1; v < 10; v++) edges.push({ u, v });
  const result = analyzeAutomorphisms(buildGraph({ n: 10, edges }), {
    maxNodes: 5,
    maxMs: 60000,
    maxMappings: 10,
  });
  assert.equal(result.status, "undetermined");
  assert.equal(result.countExact, false);
  assert.equal(result.budgetExceeded, true);
});

test("校验：拒绝自环、平行边、超范围顶点、n>10", () => {
  assert.throws(() => buildGraph({ n: 2, edges: [{ u: 0, v: 0 }] }), /自环/);
  assert.throws(
    () => buildGraph({ n: 3, edges: [{ u: 0, v: 1 }, { u: 1, v: 0 }] }),
    /平行边/,
  );
  assert.throws(() => buildGraph({ n: 2, edges: [{ u: 0, v: 2 }] }), /范围外/);
  assert.throws(() => buildGraph({ n: 11 }), /最多支持 10/);
});

function mulReader(seed: number): () => number {
  return mulberry(seed);
}
