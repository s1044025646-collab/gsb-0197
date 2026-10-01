import { GraphData, GraphInput, MAX_N } from "./types.js";

export class GraphError extends Error {}

/** 由输入构造内部图表示并严格校验简单无向图约束。 */
export function buildGraph(input: GraphInput): GraphData {
  if (!Number.isInteger(input.n) || input.n < 0) {
    throw new GraphError("n 必须为非负整数");
  }
  if (input.n > MAX_N) {
    throw new GraphError(`顶点数超出上限：n=${input.n}，本服务最多支持 ${MAX_N} 个顶点`);
  }
  const adj: boolean[][] = Array.from({ length: input.n }, () =>
    Array.from({ length: input.n }, () => false),
  );
  const colors: string[] = Array.from({ length: input.n }, () => "default");

  for (const [key, name] of Object.entries(input.colors ?? {})) {
    const idx = Number(key);
    if (!Number.isInteger(idx) || idx < 0 || idx >= input.n) {
      throw new GraphError(`颜色引用了不存在的顶点：${key}`);
    }
    if (typeof name !== "string" || name.length === 0) {
      throw new GraphError(`顶点 ${idx} 的颜色名必须是非空字符串`);
    }
    colors[idx] = name;
  }

  const edgeSet = new Set<string>();
  for (const edge of input.edges ?? []) {
    const { u, v } = edge;
    if (!Number.isInteger(u) || !Number.isInteger(v)) {
      throw new GraphError(`边的端点必须是整数：(${u}, ${v})`);
    }
    if (u < 0 || u >= input.n || v < 0 || v >= input.n) {
      throw new GraphError(`边引用了范围外顶点：(${u}, ${v})，n=${input.n}`);
    }
    if (u === v) {
      throw new GraphError(`不允许自环：(${u}, ${v})`);
    }
    const a = Math.min(u, v);
    const b = Math.max(u, v);
    const key = `${a}-${b}`;
    if (edgeSet.has(key)) {
      throw new GraphError(`不允许平行边：(${a}, ${b}) 重复出现`);
    }
    edgeSet.add(key);
    adj[a][b] = true;
    adj[b][a] = true;
  }

  return { n: input.n, adj, colors };
}

export function degree(g: GraphData, v: number): number {
  let d = 0;
  for (let w = 0; w < g.n; w++) if (g.adj[v][w]) d++;
  return d;
}

export function edgeCount(g: GraphData): number {
  let m = 0;
  for (let u = 0; u < g.n; u++)
    for (let v = u + 1; v < g.n; v++) if (g.adj[u][v]) m++;
  return m;
}

/**
 * 颜色细化（Weisfeiler–Leman / 个体细化风格）。
 * 返回每个顶点的稳定颜色类（整数类号）。
 * 初始签名包含固定颜色名与度数；迭代并入各类邻居的多集签名。
 * 仅用作候选筛选与搜索前剪枝，绝不单凭类相同就断言同构。
 */
export function refineColors(g: GraphData): number[] {
  const n = g.n;
  if (n === 0) return [];
  let classes: number[] = g.colors.map((c, v) => hashString(`${c}#${degree(g, v)}`));

  for (;;) {
    const signatures: string[] = [];
    for (let v = 0; v < n; v++) {
      const neighborClasses: number[] = [];
      for (let w = 0; w < n; w++) if (g.adj[v][w]) neighborClasses.push(classes[w]);
      neighborClasses.sort((a, b) => a - b);
      signatures.push(`${classes[v]}|${neighborClasses.join(",")}`);
    }
    const next = compressSignatures(signatures);
    if (next.every((c, i) => c === classes[i])) return next;
    classes = next;
  }
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function compressSignatures(sigs: string[]): number[] {
  const order = sigs.map((s, i) => [s, i] as [string, number]);
  order.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const result = new Array<number>(sigs.length);
  let classId = 0;
  let prev = "";
  for (const [sig, idx] of order) {
    if (sig !== prev) {
      classId++;
      prev = sig;
    }
    result[idx] = classId;
  }
  return result;
}

/**
 * 严格外部映射核验：
 * mapping 必须是 0..n-1 上的保颜色双射，且逐边、逐非边一致。
 */
export interface VerifyReport {
  valid: boolean;
  errors: string[];
}

export function verifyBijection(g1: GraphData, g2: GraphData, mapping: number[]): VerifyReport {
  const errors: string[] = [];
  if (g1.n !== g2.n) {
    errors.push(`顶点数不同：${g1.n} vs ${g2.n}`);
    return { valid: false, errors };
  }
  if (!Array.isArray(mapping) || mapping.length !== g1.n) {
    errors.push(`映射长度必须等于顶点数 ${g1.n}`);
    return { valid: false, errors };
  }
  const used = new Set<number>();
  for (let u = 0; u < g1.n; u++) {
    const t = mapping[u];
    if (!Number.isInteger(t) || t < 0 || t >= g2.n) {
      errors.push(`顶点 ${u} 映射到非法目标 ${t}`);
      continue;
    }
    if (used.has(t)) errors.push(`目标顶点 ${t} 被多个源顶点映射（非单射）`);
    used.add(t);
    if (g1.colors[u] !== g2.colors[t]) {
      errors.push(
        `颜色冲突：顶点 ${u}("${g1.colors[u]}") -> ${t}("${g2.colors[t]}")`,
      );
    }
  }
  if (used.size !== g2.n) errors.push("映射未覆盖全部目标顶点（非满射），不是双射");

  for (let u = 0; u < g1.n; u++) {
    for (let v = u + 1; v < g1.n; v++) {
      const mu = mapping[u];
      const mv = mapping[v];
      if (mu === undefined || mv === undefined) continue;
      if (g1.adj[u][v] !== g2.adj[mu][mv]) {
        errors.push(
          g1.adj[u][v]
            ? `边核验失败：(${u},${v}) 是边，但 (${mu},${mv}) 不是边`
            : `非边核验失败：(${u},${v}) 不是边，但 (${mu},${mv}) 是边`,
        );
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

/** 按给定置换重编号：newPos[oldVertex] = newIndex（perm 的逆语义也在此统一）。 */
export function renumber(g: GraphData, oldToNew: number[]): GraphData {
  if (oldToNew.length !== g.n) throw new GraphError("重编号置换长度与顶点数不符");
  const seen = new Set(oldToNew);
  if (seen.size !== g.n || [...seen].some((x) => x < 0 || x >= g.n)) {
    throw new GraphError("重编号参数必须是顶点编号上的一个置换");
  }
  const n = g.n;
  const adj = Array.from({ length: n }, () => Array.from({ length: n }, () => false));
  const colors = Array.from({ length: n }, () => "default");
  for (let u = 0; u < n; u++) {
    colors[oldToNew[u]] = g.colors[u];
    for (let v = 0; v < n; v++) {
      if (g.adj[u][v]) adj[oldToNew[u]][oldToNew[v]] = true;
    }
  }
  return { n, adj, colors };
}
