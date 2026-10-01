import { GraphData, Budget, DEFAULT_BUDGET, CanonicalResult } from "./types.js";
import { refineColors } from "./graph.js";

/**
 * 规范标号：
 * 在所有顶点置换中，取使下述编码字典序最小者：
 *   code = [每个规范位置上顶点颜色的排名] ++
 *          [对位置 k，依次给出它与位置 0..k-1 的邻接位]
 * 颜色排名仅由颜色名字典序决定（颜色名固定，不做跨图重命名）。
 * 编码中不含任何原顶点编号，因此任意重编号的同构图产生相同规范码。
 *
 * 使用分支限界：部分编码一旦大于当前最优完整编码的同长度前缀即剪枝；
 * 并用稳定细化类给出候选排序（仅排序，不跳过任何分支）。
 */
export function canonicalLabel(g: GraphData, budget: Budget = DEFAULT_BUDGET): CanonicalResult {
  const start = Date.now();
  const deadline = start + budget.maxMs;
  let nodes = 0;
  let budgetExceeded = false;
  const n = g.n;

  if (n === 0) {
    return {
      status: "proved",
      canonical: "n0;",
      permutation: [],
      nodesSearched: 1,
      elapsedMs: 0,
      budgetExceeded: false,
      reason: "空图的规范表示",
    };
  }

  const colorNames = [...new Set(g.colors)].sort();
  const colorRank = new Map(colorNames.map((c, i) => [c, i]));

  let bestCode: number[] | null = null;
  let bestPerm: number[] = [];

  const refined = refineColors(g);
  // position[k] = 放在规范位置 k 的原顶点
  const position = new Array<number>(n).fill(-1);
  const used = new Array<boolean>(n).fill(false);
  // prefix 在每个位置追加：颜色排名，随后 k 个邻接位
  const prefix: number[] = [];

  const tick = (): boolean => {
    nodes++;
    if ((nodes & 8191) === 0 && Date.now() > deadline) budgetExceeded = true;
    if (nodes > budget.maxNodes) budgetExceeded = true;
    return !budgetExceeded;
  };

  const dfs = (k: number): void => {
    if (budgetExceeded) return;
    if (!tick()) return;
    if (k === n) {
      if (bestCode === null || compareSeq(prefix, bestCode) < 0) {
        bestCode = prefix.slice();
        bestPerm = position.slice();
      }
      return;
    }
    if (bestCode !== null && prefixGreaterThan(prefix, bestCode)) return;

    const candidates = candidateOrder(g, refined, k, used);
    for (const v of candidates) {
      if (used[v]) continue;
      position[k] = v;
      used[v] = true;
      const added: number[] = [colorRank.get(g.colors[v])!];
      for (let i = 0; i < k; i++) added.push(g.adj[v][position[i]] ? 1 : 0);
      prefix.push(...added);

      if (bestCode === null || !prefixGreaterThan(prefix, bestCode)) dfs(k + 1);

      prefix.splice(prefix.length - added.length, added.length);
      used[v] = false;
      position[k] = -1;
      if (budgetExceeded) return;
    }
  };

  dfs(0);
  const elapsedMs = Date.now() - start;

  if (budgetExceeded || bestCode === null) {
    return {
      status: "undetermined",
      nodesSearched: nodes,
      elapsedMs,
      budgetExceeded: true,
      reason:
        "规范标号搜索在预算内未穷尽；已得到的最优候选编码不发布为最终规范码，以免冒充最终结果",
    };
  }

  return {
    status: "proved",
    canonical: renderCode(g, bestCode, colorNames),
    permutation: bestPerm,
    nodesSearched: nodes,
    elapsedMs,
    budgetExceeded: false,
    reason: "已对全部置换完成带剪枝的分支限界搜索",
  };
}

/** 候选排序：细化类号小的先试（帮助尽早找到小编码），再按原编号；不跳过任何顶点。 */
function candidateOrder(
  g: GraphData,
  refined: number[],
  k: number,
  used: boolean[],
): number[] {
  const list: number[] = [];
  for (let v = 0; v < g.n; v++) if (!used[v]) list.push(v);
  void k;
  list.sort((a, b) => (refined[a] - refined[b]) || (a - b));
  return list;
}

function compareSeq(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
  }
  return a.length - b.length;
}

function prefixGreaterThan(prefix: number[], best: number[]): boolean {
  const len = Math.min(prefix.length, best.length);
  for (let i = 0; i < len; i++) {
    if (prefix[i] !== best[i]) return prefix[i]! > best[i]!;
  }
  return false;
}

/** 将整数编码渲染为可读规范串：颜色表声明 + 每位置颜色/邻接位。颜色名按字典序固定。 */
function renderCode(g: GraphData, code: number[], colorNames: string[]): string {
  const n = g.n;
  const colorDecl = colorNames.map((c) => encodeName(c)).join(",");
  let pos = 0;
  const parts: string[] = [];
  for (let k = 0; k < n; k++) {
    const rank = code[pos++]!;
    const bits: string[] = [];
    for (let i = 0; i < k; i++) bits.push(String(code[pos++]));
    parts.push(`${rank}:${bits.join("")}`);
  }
  return `n${n}|c[${colorDecl}]|${parts.join("/")}`;
}

function encodeName(name: string): string {
  // 颜色名原样保留（固定标签），但转义分隔符以免破坏编码结构。
  return name.replace(/%/g, "%25").replace(/[|,:/[\]]/g, (m) => `%${m.charCodeAt(0).toString(16)}`);
}
