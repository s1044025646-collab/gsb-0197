import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rmSync, existsSync } from "node:fs";
import { spawn, spawnSync, ChildProcess } from "node:child_process";

const PORT = 3199;
const DB = "data/test-http.db";
let server: ChildProcess;

async function api(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`http://localhost:${PORT}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

before(async () => {
  if (existsSync(DB)) rmSync(DB);
  server = spawn(
    process.execPath,
    ["--import", "tsx", "src/server.ts"],
    {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(PORT), GISO_DB: DB },
      stdio: "ignore",
    },
  );
  // 等待端口就绪。
  for (let i = 0; i < 40; i++) {
    try {
      await api("GET", "/api/health");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error("测试服务器启动超时");
});

after(() => {
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"]);
    } else {
      server.kill();
    }
  } catch {
    // 忽略清理错误
  }
  for (const suffix of ["", "-wal", "-shm"]) {
    try { if (existsSync(DB + suffix)) rmSync(DB + suffix); } catch { /* 忽略 */ }
  }
});

test("HTTP 全流程：建图、同构、规范码、核验、证书查询", async () => {
  const health = await api("GET", "/api/health");
  assert.equal(health.body.ok, true);

  const p4 = { n: 4, edges: [{ u: 0, v: 1 }, { u: 1, v: 2 }, { u: 2, v: 3 }] };
  const p4Scrambled = {
    n: 4,
    edges: [{ u: 3, v: 0 }, { u: 0, v: 2 }, { u: 2, v: 1 }],
  };
  await api("POST", "/api/graphs", { name: "p4", ...p4 });
  await api("POST", "/api/graphs", { name: "p4b", ...p4Scrambled });

  const iso = await api("POST", "/api/isomorphism", { g1: { name: "p4" }, g2: { name: "p4b" } });
  assert.equal(iso.status, 200);
  assert.equal(iso.body.status, "isomorphic");
  assert.equal(iso.body.verification.valid, true);
  assert.ok(Array.isArray(iso.body.mapping));

  const c1 = await api("POST", "/api/canonical", { name: "p4" });
  const c2 = await api("POST", "/api/canonical", { name: "p4b" });
  assert.equal(c1.body.canonical, c2.body.canonical);

  // 外部核验：伪造映射被拒。
  const bad = await api("POST", "/api/verify", {
    g1: { name: "p4" },
    g2: { name: "p4b" },
    mapping: [0, 1, 2, 3],
  });
  assert.equal(bad.body.valid, false);
  assert.ok(bad.body.errors.length > 0);

  // 证书可回查，且携带绑定的图版本。
  const cert = await api("GET", `/api/certificates/comparisons/${iso.body.certificateId}`);
  assert.equal(cert.body.graph1.version, 1);
  assert.equal(cert.body.result.status, "isomorphic");
});

test("HTTP：非法图（自环）返回 400 中文错误", async () => {
  const r = await api("POST", "/api/graphs", {
    name: "bad",
    n: 2,
    edges: [{ u: 0, v: 0 }],
  });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /自环/);
});
