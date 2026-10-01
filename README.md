# 小图同构规范标号与自同构计数后端

面向 **至多 10 个顶点** 的简单无向图的同构比较服务。使用 TypeScript + Node.js + SQLite 实现，
只提供 HTTP API 与 CLI（无任何绘图界面）。在 Windows 本地直接运行，不依赖 Docker、WSL、
付费服务或外部在线 API。

## 能力范围

- 判断两图是否同构，成功时给出**保颜色双射**并对该双射做独立的逐边 / 逐非边核验；
  失败时区分「发现不变量冲突」与「回溯搜索已穷尽」两类依据。
- 生成与输入顶点编号无关的**规范表示（canonical label）**：编码中只含颜色名与结构信息，
  不含任何原顶点编号；任意重编号的同构图产生相同规范码。
- 计算单图**自同构数量（BigInt 字符串存储）**与**顶点轨道**；可限制列举映射的数量，
  但只有搜索完整时才发布精确总数。
- 统一的**节点数 / 时间预算**：超限返回 `undetermined`（未决），并返回已验证见证；
  绝不会把未搜到同构误报为不同构，也不会把未完成的候选编码发布为规范码。
- 图版本、比较请求、规范证书、自同构证书全部落 SQLite；证书**强绑定具体图版本**，
  图更新产生新版本，历史证书仍可回查且不会张冠李戴。
- 外部映射核验 API/CLI：任意提交一个双射，严格检查其是否为双射、是否保颜色、逐边一致。

## 图语义约定

- 简单无向图：**无自环、无平行边**，建图时强校验并以中文错误拒绝。
- 顶点内部编号 `0 .. n-1`，边为无序对。
- **空图**：`n = 0` 合法，有 1 个（空）自同构。
- **孤立顶点**：度数为 0 的顶点，参与同构与自同构计数（如 3 个孤立点有 `3! = 6` 个自同构）。
- **不连通图**：无特殊限制，多个相同连通分量的分量置换会被正确计入
  （如 `P3 ⊔ P3` 有 `2! · 2² = 8` 个自同构）。
- **固定颜色（顶点标签）**：颜色名是固定字符串，缺省颜色为 `"default"`。
  颜色名**不参与任何自动重命名**，`"red"` 与 `"blue"` 永远不会被合并。

## 算法说明（自行实现，非外部图服务）

- **颜色细化**：初始签名为「固定颜色名 + 度数」，迭代并入各颜色类邻居的多集签名直到稳定
  （Weisfeiler–Leman / 个体细化风格），仅用于前置剪枝与候选排序。
  本服务**不会**只凭度数序列、谱或细化颜色相同就宣称同构。
- **同构回溯**：MRV（最小候选域）选点 + 前向检查的完备 DFS；
  每个候选赋值都检查颜色相等及与全部已赋值顶点的邻接关系；找到完整映射后再独立逐边核验。
  对称分支不做任何「跳过多余等价类」的激进剪枝，保证不会丢掉可能的映射。
- **规范标号**：对全部置换做带前缀剪枝的分支限界，取结构编码字典序最小者；
  颜色仅按其名字典序排名（固定、跨图一致）。
- **自同构 / 轨道**：枚举 `g → g` 的全部保色双射，总数为 BigInt；
  轨道由全部已枚举自同构经并查集聚合，仅在枚举完整时发布。
- **预算**：`maxNodes`（递归节点数）与 `maxMs`（墙钟毫秒）统一检查；
  耗尽即停并返回未决。默认 `{ maxNodes: 2_000_000, maxMs: 5000, maxMappings: 1000 }`。

## 环境要求

- Node.js **22.5 以上**（推荐 25），使用其内置 `node:sqlite`，无需原生编译。
- 仅开发依赖 `typescript` / `tsx` / `@types/node`，运行时零第三方依赖。

## 安装与构建

```powershell
npm install
npm run build      # tsc 编译到 dist/
```

## 启动 HTTP API

```powershell
# 开发方式（tsx 直跑 TS 源码）
npm start

# 或运行编译产物
npm run serve
```

- 端口：环境变量 `PORT`（或 `GISO_PORT`），默认 `3000`。
- 数据库：环境变量 `GISO_DB`，默认项目内 `data/giso.db`（目录自动创建）。

示例：`$env:PORT=8080; npm start`

### HTTP 接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/graphs` | 列出图与最新版本 |
| POST | `/api/graphs` | 建图（生成新版本）。体：`{name,n,edges,colors}` |
| GET | `/api/graphs/:name` | 查看图（最新版本载荷） |
| POST | `/api/renumber` | 按 `oldToNew` 置换重编号并保存为新版本 |
| POST | `/api/isomorphism` | 同构查询。体：`{g1:{name,version?},g2:{...},budget?,countAll?}` |
| POST | `/api/canonical` | 计算规范表示 |
| GET | `/api/canonical/:name` | 读取已发布（proved）规范证书 |
| POST | `/api/automorphisms` | 自同构数量与轨道 |
| GET | `/api/automorphisms/:name` | 读取已发布自同构证书 |
| POST | `/api/verify` | 外部映射逐边核验。体：`{g1,g2,mapping:[...]}` |
| GET | `/api/certificates/comparisons` | 比较证书列表 |
| GET | `/api/certificates/comparisons/:id` | 单张比较证书（含绑定的两图版本载荷） |

快速体验：

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/health
```

## CLI

```powershell
npm run cli -- create <name> graph.json     # 建图
npm run cli -- list                          # 列出图
npm run cli -- show <name> [version]         # 查看版本
npm run cli -- renumber <name> perm.json [v] # 重编号生成新版本
npm run cli -- iso <name1> <name2> [--count] # 同构（--count 完整计数）
npm run cli -- canonical <name>              # 规范表示
npm run cli -- auto <name>                   # 自同构与轨道
npm run cli -- verify <name1> <name2> map.json   # 外部双射核验
npm run cli -- cert <id>                     # 查看比较证书
npm run cli -- export <id> report.json       # 导出报告
```

编译后也可直接用 `node dist/cli.js ...`。

`graph.json` 示例：

```json
{
  "n": 4,
  "edges": [{ "u": 0, "v": 1 }, { "u": 1, "v": 2 }],
  "colors": { "3": "red" }
}
```

预算可通过 `--budget-json budget.json` 传入：`{"maxNodes":100000,"maxMs":2000,"maxMappings":100}`。

## 测试

```powershell
npm test
```

测试内容：

- 路径、环、完全图、星形、两个相同连通分量、颜色破坏对称性；
- **三棱柱图 vs K3,3**：两者所有顶点度数均为 3、颜色细化难以区分，但被正确判为不同构
  （三棱柱含三角形，K3,3 不含）；
- 对 **6 个顶点以内**的图独立枚举全部置换作为预言机，核对同构判断与自同构数量：
  `n ≤ 4` 的全部标号图、`n = 5/6` 的大量随机图；
- 随机重排编号后规范表示不变；伪造双射被拒绝；
- 预算未决语义、非法输入（自环 / 平行边 / 越界 / n>10）拒绝；
- SQLite 版本绑定与「重启后」证书回查、HTTP API 端到端流程。

## 一键演示

```powershell
npm run demo
```

演示覆盖：两张编号不同的同构图、三棱柱/K3,3 非同构反例、规范码一致性、
自同构计数与轨道、伪造映射拒绝、极小预算下的未决结果，以及重新打开同一数据库后查询既有证书。

## 结果状态语义

- 同构查询：`isomorphic`（附已核验双射）/ `non-isomorphic`（冲突原因或穷尽依据）/ `undetermined`（预算不足）。
- 规范 / 自同构：`proved`（完整搜索）/ `undetermined`（预算不足，不落最终证书）。
- `countExact: false` 时任何计数都只是已发现的下界，不是精确值。

## 已知限制

- 仅支持 0–10 个顶点（规模上限为明确需求，超出返回中文错误）。
- `node:sqlite` 在 Node 22/25 带有实验性警告，功能与 API 在本环境验证可用。
- 规范标号为完整置换空间上的分支限界；对高度对称的 10 顶点图，极小预算下可能返回未决，
  此时按需求不发布最终规范码，调大 `maxNodes` / `maxMs` 后重算即可。
