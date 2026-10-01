# 小图同构规范标号与自同构计数后端

一个纯后端的简单无向图比较服务，判断两图是否同构、给出保颜色顶点对应关系、
生成与输入编号无关的规范表示，并计算单图的自同构数量与顶点轨道。

- 语言/运行时：TypeScript + Node.js（本地验证环境 Node v25）
- 存储：SQLite（`better-sqlite3`，预编译二进制，无需本机编译工具链）
- 形态：仅 HTTP/JSON API 与 CLI，无前端、无绘图、无最短路分析、无外部图服务
- 平台：Windows 本地直接运行，**不依赖** Docker、WSL、付费服务或在线 API

## 支持范围与语义

- 顶点数 **0..10**（超过拒绝）。
- **简单无向图**：无自环、无平行边，违反将返回明确校验错误。
- **空图**：`n=0, edges=[]`，自同构数为 1，规范码为 `G1|n=0|...|tri=`。
- **孤立顶点**：无边的顶点仍参与颜色、同构、自同构与规范标号；
  例如 4 个孤立点的自同构数为 `4!=24`。
- **不连通分量**：作为整体处理，`disjointUnion` 可构造多个（相同或不同）连通分量；
  相同分量之间的互换会被正确计入自同构（如两个 K₃ 不相交并的自同构数为 `6·6·2=72`）。
- **固定颜色**：每个顶点可绑定一个固定颜色名（字符串）。颜色名是固定语义，
  只允许同名颜色互相映射；不同颜色名**不能随意重命名或合并**。
  未指定颜色的顶点使用固定缺省颜色 `_default`。

## 算法与正确性

- **颜色细化（1 维 Weisfeiler–Leman）**：以颜色名为初始划分，反复用
  “自身颜色 + 邻域颜色多重集”签名细化到稳定划分，仅用于快速排除与候选约束。
- **回溯搜索（个体化）**：同构判定不会只凭度数序列、谱或细化颜色相同就下结论。
  每步用 MRV（候选最少）选择源顶点，在颜色相容目标上尝试绑定，并做
  与所有已绑定顶点的边/非边前向检查；得到完整双射后再**逐边核验**。
- **非同构结论**：只有在预算内把所有相容个体化分支穷尽，才判 `nonisomorphic`，
  并给出依据（细化冲突或搜索穷尽及访问节点数）。
- **对称处理**：自同构与规范标号枚举颜色相容排列，颜色块位置固定，
  不为加速丢弃任何分支；搜索完整才发布精确总数。
- **规范表示**：在所有颜色相容排列中取邻接矩阵字典序最小者，编码为
  `G1|n=..|colors=<固定排序颜色名>|counts=..|tri=<上三角位串>`。
  其中颜色名固定排序，位串来自最小化后的邻接矩阵，**不含任何原顶点编号**；
  任意输入编号重排后规范码相同。预算不足时状态为 `undecided`，不发布最终规范码。
- **自同构计数**：计数以 **BigInt 字符串** 保存；可限制列举映射数量，
  但精确总数只在搜索完整时发布。轨道由已确认自同构做并查集合并得到。
- **预算**：统一的“最大搜索节点数 + 墙钟时间”双预算；超限返回 `undecided`，
  附已验证见证，绝不把“未搜到同构”当成“不同构”，也不把未完成候选编码冒充规范码。

## 数据模型（SQLite）

- `graphs` / `graph_versions`：图与**不可变版本**（版本号自增）。
- `comparisons`：比较请求与结论，外键绑定两个具体 `graph_version_id`。
- `certificates`：规范码、自同构总数（字符串）、轨道，绑定唯一图版本；
  未决时状态 `undecided` 且精确字段为空。
- `verifications`：外部提交双射的核验记录。

历史结果始终绑定其创建时的图版本；进程重启后用版本 ID 即可继续查询既有证书。

## 构建与运行

```powershell
npm install        # 安装依赖（better-sqlite3 使用预编译二进制）
npm run build      # 仅编译 TypeScript 到 dist/
npm test           # 编译并运行全部测试（138 项断言）
npm run demo       # 编译并运行端到端演示（使用临时数据目录）
npm start          # 启动 HTTP API（默认端口 3000，数据目录 ./data）
```

### 可配置端口与数据目录

```powershell
$env:PORT="8080"; $env:DATA_DIR="$PWD\data"; npm start
# 或：node dist/src/api/main.js <端口> <数据目录>
$env:BUDGET_NODES="50000000"; $env:BUDGET_MS="30000"; npm start
```

## HTTP API（JSON）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET  | `/health` | 健康检查 |
| POST | `/graphs` | 建图并创建首个版本，body：`{name, graph}` |
| GET  | `/graphs` | 列出图与版本 |
| GET  | `/graphs/:id` | 图详情（含版本、证书、比较） |
| POST | `/graphs/:id/versions` | 追加不可变版本，body：`{graph}` |
| POST | `/isomorphism` | body：`{source_version_id, target_version_id, budget?}` |
| POST | `/versions/:id/analyze` | 规范化 + 自同构，生成/更新证书 |
| GET  | `/versions/:id/certificate` | 读取既有证书（重启后可用） |
| POST | `/verify-mapping` | body：`{source_version_id, target_version_id, mapping}` 外部双射核验 |
| GET  | `/reports?graph_id=..` | 导出绑定版本的完整 JSON 报告 |

图 JSON 形式：

```json
{ "n": 3, "edges": [[0,1],[1,2]], "colors": { "0": "red", "2": "blue" } }
```

同构成功返回 `status:"isomorphic"` 与 `mapping`（源顶点→目标顶点数组）；
失败返回 `"nonisomorphic"` 与中文 `reason`；未决返回 `"undecided"` 与见证。

## CLI

```powershell
node dist/src/cli/cli.js --help
node dist/src/cli/cli.js create 三棱柱 prism.json
node dist/src/cli/cli.js add-version <graph_id> graph.json
node dist/src/cli/cli.js list
node dist/src/cli/cli.js relabel graph.json perm.json     # 重编号，输出新图
node dist/src/cli/cli.js iso <src_vid> <tgt_vid> [预算节点] [预算ms]
node dist/src/cli/cli.js canonical <vid>                  # 规范码
node dist/src/cli/cli.js auto <vid> [列举上限]            # 自同构与轨道
node dist/src/cli/cli.js analyze <vid>                    # 生成/更新证书
node dist/src/cli/cli.js certificate <vid>                # 重启后查询证书
node dist/src/cli/cli.js verify <src_vid> <tgt_vid> mapping.json
node dist/src/cli/cli.js report <graph_id> out.json
```

`perm.json` 是长度 n 的“旧→新”置换数组；`mapping.json` 是“源→目标”数组。
`DATA_DIR` 环境变量可改数据目录（默认 `./data`）。

## 测试覆盖

- 路径、环、完全图、星形、多个相同连通分量、颜色破坏对称。
| **三棱柱图 vs K₃,₃**：两者都是 3-正则（度数序列完全相同）且颜色细化难以区分，
  被正确判定为**不同构**；并与独立暴力枚举结论一致。
- 对 **6 个顶点以内**的图库，独立枚举全部置换交叉核对同构判断、
  自同构数与轨道。
- 任意随机编号重排后规范码保持不变；非同构图规范码不同。
- 伪造双射（边不一致 / 非双射 / 颜色不一致）被拒绝。
- 极小预算返回 `undecided` 且不发布规范码/精确总数。
- 非法输入（自环、平行边、越界、超过 10 顶点）被拒绝。

运行：`npm test`。

## 限制与假设

- 仅支持至多 10 个顶点的简单无向图；面向小图，规范标号最坏枚举约数百万到千万节点。
- 规范码版本前缀 `G1` 标识编码格式；颜色名参与编码且按名字固定排序，
  颜色改名会被视为不同约束。
- 预算默认节点 5×10⁷、时间 30 秒，可通过环境变量或每次请求的 `budget` 覆盖。
- 未明确之处采用的合理假设：颜色以字符串名称为唯一固定标识；缺省颜色统一为 `_default`；
  比较与分析结果一旦落库即与当时版本永久绑定。
