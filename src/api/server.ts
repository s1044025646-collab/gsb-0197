// 仅后端 HTTP/JSON API。无绘图、无外部服务。

import * as http from "http";
import { IsoService } from "../core/service";

interface JsonHandler {
  service: IsoService;
}

function send(res: http.ServerResponse, code: number, body: unknown) {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(json);
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error("请求体不是合法 JSON"));
      }
    });
  });
}

export function createServer({ service }: JsonHandler): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;
    try {
      if (req.method === "GET" && pathname === "/health") {
        return send(res, 200, { ok: true, service: "graph-iso", n_max: 10 });
      }

      if (req.method === "POST" && pathname === "/graphs") {
        const body = await readBody(req);
        const r = service.addGraph(body.name ?? "graph", body.graph);
        return send(res, 201, {
          graph_id: r.graph.id,
          version_id: r.version.id,
          version: r.version.version,
          n: r.normalized.n,
          color_names: r.normalized.colorNames,
        });
      }

      if (req.method === "GET" && pathname === "/graphs") {
        return send(res, 200, service.listGraphs());
      }

      const mGraphs = pathname.match(/^\/graphs\/(\d+)$/);
      if (req.method === "GET" && mGraphs) {
        const report = service.report(Number(mGraphs[1]));
        if (!report) return send(res, 404, { error: "图不存在" });
        return send(res, 200, report);
      }

      const mVersion = pathname.match(/^\/graphs\/(\d+)\/versions$/);
      if (req.method === "POST" && mVersion) {
        const body = await readBody(req);
        const v = service.addVersion(Number(mVersion[1]), body.graph);
        return send(res, 201, { version_id: v.id, version: v.version, n: v.n });
      }

      if (req.method === "POST" && pathname === "/isomorphism") {
        const body = await readBody(req);
        const r = service.compare(body.source_version_id, body.target_version_id, body.budget);
        return send(res, 200, r);
      }

      const mAnalyze = pathname.match(/^\/versions\/(\d+)\/analyze$/);
      if (req.method === "POST" && mAnalyze) {
        const body = await readBody(req).catch(() => ({}));
        const r = service.analyze(
          Number(mAnalyze[1]),
          body.budget,
          body.enumerate_limit ?? 64
        );
        return send(res, 200, r);
      }

      const mCert = pathname.match(/^\/versions\/(\d+)\/certificate$/);
      if (req.method === "GET" && mCert) {
        const cert = service.getCertificate(Number(mCert[1]));
        if (!cert) return send(res, 404, { error: "尚无证书" });
        return send(res, 200, cert);
      }

      if (req.method === "POST" && pathname === "/verify-mapping") {
        const body = await readBody(req);
        const r = service.verifyExternalMapping(
          body.source_version_id,
          body.target_version_id,
          body.mapping
        );
        return send(res, 200, r);
      }

      if (req.method === "GET" && pathname === "/reports") {
        const id = Number(url.searchParams.get("graph_id"));
        const report = service.report(id);
        if (!report) return send(res, 404, { error: "图不存在" });
        return send(res, 200, report);
      }

      send(res, 404, { error: "未知路由", method: req.method, path: pathname });
    } catch (e) {
      send(res, 400, { error: (e as Error).message });
    }
  });
  return server;
}
