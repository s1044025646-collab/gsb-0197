// 核心数据结构与公共类型定义

/** 简单无向图：顶点用 0..n-1 编号；edge 为无向边集合。 */
export interface GraphData {
  /** 顶点数 0..10；0 表示空图。 */
  n: number;
  /** 边为 [u,v]，要求 u<v、0<=u,v<n、u!=v、不重复。 */
  edges: Array<[number, number]>;
  /** 顶点固定标签（颜色）。键为顶点编号；未给定时按默认颜色处理。 */
  colors?: Record<number, string>;
  /** 缺省颜色名称，固定不可与显式颜色重命名合并。 */
  defaultColor?: string;
}

/** 校验后的规范化图内部表示。 */
export interface NormalizedGraph {
  n: number;
  /** 邻接矩阵 adj[u] 为位掩码，位 v 表示 u-v 相邻。 */
  adj: number[];
  /** 每个顶点的颜色名（长度 n），颜色名是固定语义。 */
  colors: string[];
  /** 出现过的颜色名集合（按首次出现顺序）。 */
  colorNames: string[];
}

export const MAX_N = 10;
export const DEFAULT_COLOR = "_default";

export class GraphValidationError extends Error {}

/** 校验并归一化外部图数据。 */
export function normalizeGraph(data: GraphData): NormalizedGraph {
  if (!Number.isInteger(data.n) || data.n < 0 || data.n > MAX_N) {
    throw new GraphValidationError(
      `顶点数 n 必须是 0..${MAX_N} 的整数，收到 ${String(data.n)}`
    );
  }
  const n = data.n;
  const adj = new Array<number>(n).fill(0);
  const seen = new Set<number>();
  for (const [rawU, rawV] of data.edges ?? []) {
    const u = rawU;
    const v = rawV;
    if (!Number.isInteger(u) || !Number.isInteger(v)) {
      throw new GraphValidationError("边的端点必须是整数顶点编号");
    }
    if (u < 0 || u >= n || v < 0 || v >= n) {
      throw new GraphValidationError(`边 [${u},${v}] 超出顶点范围 0..${n - 1}`);
    }
    if (u === v) {
      throw new GraphValidationError(`不允许自环：[${u},${v}]`);
    }
    const lo = Math.min(u, v);
    const hi = Math.max(u, v);
    const key = lo * (MAX_N + 1) + hi;
    if (seen.has(key)) {
      throw new GraphValidationError(`不允许平行边：[${lo},${hi}] 重复`);
    }
    seen.add(key);
    adj[lo] |= 1 << hi;
    adj[hi] |= 1 << lo;
  }
  const defaultColor = data.defaultColor && data.defaultColor.length > 0
    ? data.defaultColor
    : DEFAULT_COLOR;
  const colors = new Array<string>(n).fill(defaultColor);
  const colorNames: string[] = [];
  const pushName = (name: string) => {
    if (!colorNames.includes(name)) colorNames.push(name);
  };
  for (const [idx, name] of Object.entries(data.colors ?? {})) {
    const v = Number(idx);
    if (!Number.isInteger(v) || v < 0 || v >= n) {
      throw new GraphValidationError(`颜色绑定的顶点 ${idx} 超出范围`);
    }
    if (typeof name !== "string" || name.length === 0) {
      throw new GraphValidationError(`顶点 ${v} 的颜色名必须是非空字符串`);
    }
    colors[v] = name;
  }
  for (const c of colors) pushName(c);
  return { n, adj, colors, colorNames };
}

/** 逐边核验：双射 mapping（源顶点 -> 目标顶点）是否保持颜色与边/非边关系。 */
export function verifyBijection(
  source: NormalizedGraph,
  target: NormalizedGraph,
  mapping: number[]
): { ok: boolean; reason?: string } {
  if (source.n !== target.n) return { ok: false, reason: "顶点数不同" };
  const n = source.n;
  if (mapping.length !== n) {
    return { ok: false, reason: `映射长度应为 ${n}，实际 ${mapping.length}` };
  }
  const used = new Set<number>();
  for (let u = 0; u < n; u++) {
    const w = mapping[u];
    if (!Number.isInteger(w) || w < 0 || w >= n) {
      return { ok: false, reason: `顶点 ${u} 的像 ${w} 超出范围` };
    }
    if (used.has(w)) {
      return { ok: false, reason: `不是双射：顶点 ${w} 被多次映射` };
    }
    used.add(w);
    if (source.colors[u] !== target.colors[w]) {
      return {
        ok: false,
        reason: `颜色不保持：顶点 ${u}(${source.colors[u]}) -> 顶点 ${w}(${target.colors[w]})`,
      };
    }
  }
  for (let u = 0; u < n; u++) {
    for (let v = u + 1; v < n; v++) {
      const edgeSrc = ((source.adj[u] >> v) & 1) === 1;
      const mu = mapping[u];
      const mv = mapping[v];
      const edgeTgt = ((target.adj[mu] >> mv) & 1) === 1;
      if (edgeSrc !== edgeTgt) {
        return {
          ok: false,
          reason: `边关系不一致：源 (${u},${v}) ${edgeSrc ? "有边" : "无边"}，像 (${mu},${mv}) ${
            edgeTgt ? "有边" : "无边"
          }`,
        };
      }
    }
  }
  return { ok: true };
}

/** 预算控制：节点数与墙钟时间。 */
export interface Budget {
  maxNodes: number;
  deadline: number; // performance.now() 毫秒时间戳
}

export function makeBudget(maxNodes: number, maxMs: number): Budget {
  return { maxNodes, deadline: Date.now() + maxMs };
}

export class BudgetExhausted extends Error {
  constructor(public nodesUsed: number) {
    super("预算耗尽，搜索未完成");
    this.name = "BudgetExhausted";
  }
}

/** 搜索计数器，统一记账节点与时间预算。 */
export class SearchMeter {
  nodes = 0;
  constructor(private budget: Budget) {}
  tick(): void {
    this.nodes++;
    if (this.nodes > this.budget.maxNodes || Date.now() > this.budget.deadline) {
      throw new BudgetExhausted(this.nodes);
    }
  }
  get exhausted(): boolean {
    return this.nodes > this.budget.maxNodes || Date.now() > this.budget.deadline;
  }
}
