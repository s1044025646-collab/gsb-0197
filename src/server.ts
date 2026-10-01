import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { App } from "./app.js";
import { Store } from "./store.js";
import { GraphError } from "./graph.js";
import { MAX_N } from "./types.js";

const PORT = Number(process.env.PORT ?? process.env.GISO_PORT ?? 3000);
const DB_PATH = process.env.GISO_DB ?? "data/giso.db";

const store = new Store(DB_PATH);
const app = new App(store);

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(json);
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf-8").replace(/^﻿/, "");
  if (raw.length === 0) return {};
  return JSON.parse(raw);
}

interface Route {
  method: string;
  pattern: RegExp;
  handler: (params: Record<string, string>, body: any, res: ServerResponse) => unknown;
}

const routes: Route[] = [
  {
    method: "GET",
    pattern: /^\/api\/health$/,
    handler: (_p, _b, res) => send(res, 200, { ok: true, maxN: MAX_N, db: DB_PATH }),
  },
  {
    method: "GET",
    pattern: /^\/api\/graphs$/,
    handler: (_p, _b, res) => send(res, 200, { graphs: app.store.listGraphs() }),
  },
  {
    method: "POST",
    pattern: /^\/api\/graphs$/,
    handler: (_p, body, res) => {
      if (!body.name) throw new GraphError("name 必填");
      const saved = app.saveGraph(body);
      send(res, 201, {
        name: body.name,
        graphId: saved.graphId,
        version: saved.version.version,
        versionId: saved.version.id,
      });
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/graphs\/(?<name>[^/]+)$/,
    handler: (p, _b, res) => {
      const { row } = app.resolve({ name: decodeURIComponent(p.name!) });
      send(res, 200, {
        name: decodeURIComponent(p.name!),
        version: row.version,
        versionId: row.id,
        payload: JSON.parse(row.payload),
      });
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/renumber$/,
    handler: (_p, body, res) => {
      const row = app.renumberGraph(
        { name: body.name, version: body.version },
        body.oldToNew,
      );
      send(res, 201, { name: body.name, version: row.version, versionId: row.id, payload: JSON.parse(row.payload) });
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/isomorphism$/,
    handler: (_p, body, res) =>
      send(
        res,
        200,
        app.isomorphism(body.g1, body.g2, body.budget, body.countAll === true),
      ),
  },
  {
    method: "POST",
    pattern: /^\/api\/canonical$/,
    handler: (_p, body, res) =>
      send(res, 200, app.canonical({ name: body.name, version: body.version }, body.budget)),
  },
  {
    method: "GET",
    pattern: /^\/api\/canonical\/(?<name>[^/]+)$/,
    handler: (p, _b, res) => {
      const cert = app.getCanonicalCert({ name: decodeURIComponent(p.name!) });
      send(res, cert ? 200 : 404, cert ?? { error: "尚无已发布的规范证书（未决结果不落库）" });
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/automorphisms$/,
    handler: (_p, body, res) =>
      send(res, 200, app.automorphisms({ name: body.name, version: body.version }, body.budget)),
  },
  {
    method: "GET",
    pattern: /^\/api\/automorphisms\/(?<name>[^/]+)$/,
    handler: (p, _b, res) => {
      const cert = app.getAutomorphismCert({ name: decodeURIComponent(p.name!) });
      send(res, cert ? 200 : 404, cert ?? { error: "尚无已发布的自同构证书" });
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/verify$/,
    handler: (_p, body, res) => send(res, 200, app.verify(body.g1, body.g2, body.mapping)),
  },
  {
    method: "GET",
    pattern: /^\/api\/certificates\/comparisons\/(?<id>\d+)$/,
    handler: (p, _b, res) => {
      const cert = app.comparisonCertificate(Number(p.id));
      send(res, cert ? 200 : 404, cert ?? { error: "证书不存在" });
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/certificates\/comparisons$/,
    handler: (_p, _b, res) => send(res, 200, { comparisons: store.listComparisons() }),
  },
];

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, `http://${req.headers.host ?? "localhost"}`);
    const body = req.method === "POST" ? await readJson(req) : {};
    for (const route of routes) {
      if (route.method !== req.method) continue;
      const match = route.pattern.exec(url.pathname);
      if (match) {
        await route.handler(match.groups ?? {}, body, res);
        return;
      }
    }
    send(res, 404, { error: `无此路由：${req.method} ${url.pathname}` });
  } catch (err) {
    if (err instanceof GraphError || err instanceof SyntaxError) {
      send(res, 400, { error: err.message });
    } else {
      const message = err instanceof Error ? err.message : String(err);
      send(res, 500, { error: message });
    }
  }
});

server.listen(PORT, () => {
  console.log(`[giso] HTTP API 已启动: http://localhost:${PORT}`);
  console.log(`[giso] 数据目录数据库: ${DB_PATH}`);
});
