#!/usr/bin/env node
import { Store } from "./store.js";
import { App } from "./app.js";
import { GraphError } from "./graph.js";
import { writeFileSync, readFileSync } from "node:fs";

const DB_PATH = process.env.GISO_DB ?? "data/giso.db";

function usage(): never {
  console.error(`用法: gisocli <命令> [参数]

图管理:
  create <name> <graph.json>                 从 JSON 文件建图（生成新版本）
  list                                       列出全部图与最新版本
  show <name> [version]                      查看指定版本图内容
  renumber <name> <perm.json> [version]      按 oldToNew 置换重编号并生成新版本

分析:
  iso <name1> <name2> [--count] [--budget-json f]  同构查询（--count 完整计数）
  canonical <name> [--budget-json f]                计算规范表示
  auto <name> [--budget-json f]                     自同构数量与轨道
  verify <name1> <name2> <mapping.json>             外部双射逐边核验

证书与导出:
  cert <comparisonId>                       查看比较证书（绑定图版本）
  cert-canonical <name>                     查看已发布规范证书
  cert-auto <name>                          查看已发布自同构证书
  export <comparisonId> <out.json>          导出比较报告到文件

环境变量:
  GISO_DB   数据库路径（默认 data/giso.db）

graph.json 示例:
  {"n":4,"edges":[{"u":0,"v":1},{"u":1,"v":2}],"colors":{"3":"red"}}
`);
  process.exit(1);
}

function readJson(path: string): any {
  const text = readFileSync(path, "utf-8").replace(/^﻿/, "");
  return JSON.parse(text);
}

function parseBudgetFlag(args: string[]): Record<string, number> | undefined {
  const idx = args.indexOf("--budget-json");
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (!value) throw new GraphError("--budget-json 需要文件路径");
  return readJson(value);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd) usage();
  const store = new Store(DB_PATH);
  const app = new App(store);
  const out = (v: unknown) => console.log(JSON.stringify(v, null, 2));

  try {
    switch (cmd) {
      case "create": {
        const [name, file] = rest;
        if (!name || !file) usage();
        const body = readJson(file);
        const saved = app.saveGraph({ ...body, name });
        out({ name, graphId: saved.graphId, version: saved.version.version, versionId: saved.version.id });
        break;
      }
      case "list":
        out({ graphs: app.store.listGraphs() });
        break;
      case "show": {
        const [name, version] = rest;
        if (!name) usage();
        const { row } = app.resolve({ name, version: version ? Number(version) : undefined });
        out({ name, version: row.version, versionId: row.id, payload: JSON.parse(row.payload) });
        break;
      }
      case "renumber": {
        const [name, permFile, version] = rest;
        if (!name || !permFile) usage();
        const oldToNew = readJson(permFile);
        const row = app.renumberGraph({ name, version: version ? Number(version) : undefined }, oldToNew);
        out({ name, version: row.version, versionId: row.id, payload: JSON.parse(row.payload) });
        break;
      }
      case "iso": {
        const positional = [];
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === "--budget-json") { i++; continue; }
          positional.push(rest[i]);
        }
        const names = positional.filter((a) => a !== "--count");
        const countAll = rest.includes("--count");
        const [n1, n2] = names;
        if (!n1 || !n2) usage();
        out(app.isomorphism({ name: n1 }, { name: n2 }, parseBudgetFlag(rest), countAll));
        break;
      }
      case "canonical": {
        const name = rest.find((a) => !a.startsWith("--"));
        if (!name) usage();
        out(app.canonical({ name }, parseBudgetFlag(rest)));
        break;
      }
      case "auto": {
        const name = rest.find((a) => !a.startsWith("--"));
        if (!name) usage();
        out(app.automorphisms({ name }, parseBudgetFlag(rest)));
        break;
      }
      case "verify": {
        const [n1, n2, mappingFile] = rest;
        if (!n1 || !n2 || !mappingFile) usage();
        out(app.verify({ name: n1 }, { name: n2 }, readJson(mappingFile)));
        break;
      }
      case "cert": {
        const id = Number(rest[0]);
        if (!id) usage();
        const cert = app.comparisonCertificate(id);
        if (!cert) throw new GraphError(`比较证书 ${id} 不存在`);
        out(cert);
        break;
      }
      case "cert-canonical": {
        const cert = app.getCanonicalCert({ name: rest[0]! });
        if (!cert) throw new GraphError("规范证书不存在（只有 proved 结果才会落库）");
        out(cert);
        break;
      }
      case "cert-auto": {
        const cert = app.getAutomorphismCert({ name: rest[0]! });
        if (!cert) throw new GraphError("自同构证书不存在（只有 proved 结果才会落库）");
        out(cert);
        break;
      }
      case "export": {
        const [idStr, outFile] = rest;
        const cert = app.comparisonCertificate(Number(idStr));
        if (!cert) throw new GraphError(`比较证书 ${idStr} 不存在`);
        writeFileSync(outFile, JSON.stringify(cert, null, 2), "utf-8");
        console.log(`报告已导出: ${outFile}`);
        break;
      }
      default:
        usage();
    }
  } finally {
    store.close();
  }
}

main().catch((err) => {
  if (err instanceof GraphError) {
    console.error(`错误: ${err.message}`);
    process.exit(2);
  }
  console.error(err);
  process.exit(1);
});
