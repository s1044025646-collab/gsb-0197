// 命令行：建图、重编号、同构查询、规范化、自同构分析、外部映射核验、报告导出。

import * as fs from "fs";
import * as path from "path";
import { openDatabase } from "../db/database";
import { Repository } from "../db/repository";
import { IsoService, DEFAULT_BUDGET } from "../core/service";
import { GraphData } from "../core/types";
import { relabel } from "../core/graphs";

function usage() {
  console.log(`图同构规范标号与自同构计数 CLI

用法:
  node dist/src/cli/cli.js <命令> [参数]

命令:
  initdb                         初始化/打印数据目录
  create <名称> <graph.json>     建图并新增首个版本，打印 graph_id/version_id
  add-version <graph_id> <g.json> 为既有图追加不可变版本
  list                           列出所有图与版本
  relabel <graph.json> <perm.json> 按置换重编号并输出新图 JSON（不落库）
  iso <src_version_id> <tgt_version_id> [预算节点] [预算ms]
  canonical <version_id>         规范化（内部 analyze 的一部分，直接给规范码）
  auto <version_id> [列举上限]   自同构数量与轨道
  analyze <version_id>           规范化+自同构，生成/更新证书
  certificate <version_id>       查询既有证书（重启后可用）
  verify <src_vid> <tgt_vid> <mapping.json>  核验外部双射
  report <graph_id> [out.json]   导出绑定版本的报告

环境变量: DATA_DIR(默认 ./data)
graph.json 形如: {"n":3,"edges":[[0,1],[1,2]],"colors":{"0":"red"}}
perm.json: 一个长度 n 的旧->新置换数组；mapping.json: 源->目标数组。
`);
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

export function runCli(argv: string[]): number {
  const cmd = argv[0];
  if (!cmd || cmd === "-h" || cmd === "--help") {
    usage();
    return 0;
  }
  const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), "data"));
  const handle = openDatabase(dataDir);
  const repo = new Repository(handle.db);
  const service = new IsoService(repo, DEFAULT_BUDGET);

  try {
    switch (cmd) {
      case "initdb": {
        console.log(`数据目录就绪: ${dataDir}`);
        break;
      }
      case "create": {
        const [name, file] = [argv[1], argv[2]];
        const r = service.addGraph(name ?? "graph", readJson(file) as GraphData);
        console.log(JSON.stringify({
          graph_id: r.graph.id,
          version_id: r.version.id,
          version: r.version.version,
          n: r.normalized.n,
          color_names: r.normalized.colorNames,
        }, null, 2));
        break;
      }
      case "add-version": {
        const v = service.addVersion(Number(argv[1]), readJson(argv[2]) as GraphData);
        console.log(JSON.stringify({ version_id: v.id, version: v.version, n: v.n }, null, 2));
        break;
      }
      case "list": {
        console.log(JSON.stringify(service.listGraphs(), null, 2));
        break;
      }
      case "relabel": {
        const out = relabel(readJson(argv[1]) as GraphData, readJson(argv[2]) as number[]);
        console.log(JSON.stringify(out, null, 2));
        break;
      }
      case "iso": {
        const budget = {
          maxNodes: Number(argv[3] ?? DEFAULT_BUDGET.maxNodes),
          maxMs: Number(argv[4] ?? DEFAULT_BUDGET.maxMs),
        };
        console.log(JSON.stringify(
          service.compare(Number(argv[1]), Number(argv[2]), budget),
          null,
          2
        ));
        break;
      }
      case "canonical": {
        const r = service.analyze(Number(argv[1]));
        console.log(JSON.stringify(r.canonical, null, 2));
        break;
      }
      case "auto": {
        const r = service.analyze(Number(argv[1]), undefined, Number(argv[2] ?? 16));
        console.log(JSON.stringify(r.automorphism, null, 2));
        break;
      }
      case "analyze": {
        console.log(JSON.stringify(service.analyze(Number(argv[1])), null, 2));
        break;
      }
      case "certificate": {
        const cert = service.getCertificate(Number(argv[1]));
        if (!cert) {
          console.log("尚无证书");
          return 1;
        }
        console.log(JSON.stringify(cert, null, 2));
        break;
      }
      case "verify": {
        const r = service.verifyExternalMapping(
          Number(argv[1]),
          Number(argv[2]),
          readJson(argv[3]) as number[]
        );
        console.log(JSON.stringify(r, null, 2));
        return r.ok ? 0 : 2;
      }
      case "report": {
        const report = service.report(Number(argv[1]));
        if (!report) {
          console.log("图不存在");
          return 1;
        }
        const text = JSON.stringify(report, null, 2);
        if (argv[2]) fs.writeFileSync(argv[2], text, "utf-8");
        console.log(text);
        break;
      }
      default:
        console.error(`未知命令: ${cmd}`);
        usage();
        return 1;
    }
    return 0;
  } finally {
    handle.close();
  }
}

if (require.main === module) {
  process.exit(runCli(process.argv.slice(2)));
}
