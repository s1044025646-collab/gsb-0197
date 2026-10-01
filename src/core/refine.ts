// 一维颜色细化（Weisfeiler–Leman / 邻域多重集签名）。
// 注意：细化只用于剪枝与候选约束，颜色相同绝不直接等同于同构。

import { NormalizedGraph } from "./types";

export interface Refinement {
  /** 每个顶点的稳定颜色类编号。 */
  labels: number[];
  /** 类编号 -> 顶点列表。 */
  classes: number[][];
  /** 是否所有类都是单元素（离散）。 */
  discrete: boolean;
}

/** 迭代细化到稳定划分；初始颜色为固定颜色名。 */
export function refine(g: NormalizedGraph): Refinement {
  const n = g.n;
  // 初始标签按颜色名固定排序，保证跨图一致。
  const palette = [...g.colorNames].sort();
  let labels = g.colors.map((c) => palette.indexOf(c));

  for (;;) {
    const signatures: string[] = [];
    for (let u = 0; u < n; u++) {
      const neighborColors: number[] = [];
      const bits = g.adj[u];
      for (let v = 0; v < n; v++) {
        if (((bits >> v) & 1) === 1) neighborColors.push(labels[v]);
      }
      neighborColors.sort((a, b) => a - b);
      signatures.push(`${labels[u]}|${neighborColors.join(",")}`);
    }
    const uniq = Array.from(new Set(signatures)).sort();
    const map = new Map(uniq.map((s, i) => [s, i]));
    const next = signatures.map((s) => map.get(s)!);
    if (next.every((v, i) => v === labels[i])) {
      labels = next;
      break;
    }
    labels = next;
  }

  const classMap = new Map<number, number[]>();
  labels.forEach((lab, v) => {
    if (!classMap.has(lab)) classMap.set(lab, []);
    classMap.get(lab)!.push(v);
  });
  const classIds = Array.from(classMap.keys()).sort((a, b) => a - b);
  const classes = classIds.map((id) => classMap.get(id)!);
  return { labels, classes, discrete: classes.every((c) => c.length === 1) };
}

/** 两个图的稳定颜色类大小多重集是否一致（同构必要条件，非充分）。 */
export function classSizeSignature(g: NormalizedGraph): string {
  const sizes = refine(g).classes.map((c) => c.length).sort((a, b) => a - b);
  return sizes.join(",");
}

/** 细化后逐类签名（含颜色名与类大小），用于快速排除明显不同构。 */
export function quickRefineIncompatible(a: NormalizedGraph, b: NormalizedGraph): boolean {
  if (a.n !== b.n) return true;
  if (JSON.stringify([...a.colorNames].sort()) !== JSON.stringify([...b.colorNames].sort())) {
    return true;
  }
  return classSizeSignature(a) !== classSizeSignature(b);
}
