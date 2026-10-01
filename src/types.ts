/**
 * 核心数据结构定义。
 *
 * 语义约定：
 * - 简单无向图：无自环、无平行边。
 * - 顶点编号：0 .. n-1（内部）；边为无序对 {u,v}，u < v。
 * - 空图：n = 0（合法）。孤立顶点：n >= 1 且度数为 0。
 * - 颜色：颜色名称是固定标签，不参与任何“自动重命名”；
 *   两个颜色名不同的顶点永远不能映射到彼此。
 */

export interface EdgeInput {
  u: number;
  v: number;
}

export interface GraphInput {
  name?: string;
  n: number;
  edges?: EdgeInput[];
  /** 顶点固定颜色（标签）。键为顶点编号，值为颜色名；缺省视为默认颜色 "default"。 */
  colors?: Record<number, string>;
}

export interface GraphData {
  n: number;
  /** 邻接矩阵对称布尔表示。 */
  adj: boolean[][];
  /** colors[i] 为顶点 i 的颜色名（永不被规范化重命名）。 */
  colors: string[];
}

export interface Budget {
  /** 搜索允许访问的递归节点上限。 */
  maxNodes: number;
  /** 搜索允许的墙钟毫秒数上限。 */
  maxMs: number;
  /** 自同构枚举最多保留的映射数量（计数仍在完整搜索时为精确值）。 */
  maxMappings: number;
}

export const DEFAULT_BUDGET: Budget = {
  maxNodes: 2_000_000,
  maxMs: 5000,
  maxMappings: 1000,
};

export const MAX_N = 10;

export type SearchStatus = "proved" | "disproved" | "undetermined";

export interface MappingResult {
  status: SearchStatus;
  /** 保颜色双射：mapping[g1 顶点] = g2 顶点。找到同构时存在。 */
  mapping?: number[];
  /** 已验证的见证映射（即便未决也可能已有一个，自同构场景为非平凡自同构）。 */
  witnesses: number[][];
  /** 搜索消耗的递归节点数。 */
  nodesSearched: number;
  /** 实际用时毫秒。 */
  elapsedMs: number;
  /** 是否因预算耗尽而停止。 */
  budgetExceeded: boolean;
  /** 失败/未决时的人类可读依据。 */
  reason: string;
  /** 同构：精确双射数量（完整搜索时）；未决时为已发现下界。 */
  countExact: boolean;
  count: bigint;
}

export interface CanonicalResult {
  status: SearchStatus;
  /** 规范表示：不含任何原顶点编号；仅由颜色名与边结构决定。 */
  canonical?: string;
  /** 达成规范标号的一个置换（原顶点 -> 规范位置），供调试/映射。 */
  permutation?: number[];
  nodesSearched: number;
  elapsedMs: number;
  budgetExceeded: boolean;
  reason: string;
}

export interface OrbitResult {
  status: SearchStatus;
  automorphismCount?: string;
  /** orbit[i] 为顶点 i 的轨道代表编号（同轨道顶点代表相同）。 */
  orbits?: number[][];
  mappings: number[][];
  mappingsTruncated: boolean;
  nodesSearched: number;
  elapsedMs: number;
  budgetExceeded: boolean;
  reason: string;
  countExact: boolean;
}
