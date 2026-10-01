import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, existsSync } from "node:fs";
import { Store } from "../src/store.js";
import { App } from "../src/app.js";
import { pathGraph, triangularPrism, completeBipartite } from "./helpers.js";

const DB = "data/test-persistence.db";

test("图版本与证书：重启后既有证书仍绑定原版本", () => {
  if (existsSync(DB)) rmSync(DB);
  {
    const store = new Store(DB);
    const app = new App(store);
    app.saveGraph({ name: "gA", ...pathGraph(4) });
    app.saveGraph({ name: "gB", ...pathGraph(4) });
    const iso = app.isomorphism({ name: "gA" }, { name: "gB" });
    assert.equal(iso.status, "isomorphic");
    assert.ok(iso.certificateId);
    const canon = app.canonical({ name: "gA" });
    assert.equal(canon.status, "proved");
    // 第二版：改成三棱柱（非同构），旧版本证书应保持与旧版本绑定。
    app.saveGraph({ name: "gA", ...triangularPrism() });
    const iso2 = app.isomorphism({ name: "gA" }, { name: "gB" });
    assert.equal(iso2.status, "non-isomorphic");
    store.close();
  }

  // 模拟重启：重新打开同一数据库文件。
  {
    const store = new Store(DB);
    const app = new App(store);
    const versions = app.store.listGraphs();
    const gA = versions.find((g) => g.name === "gA")!;
    assert.equal(gA.latest_version, 2);
    // 第一版规范证书仍可查，且其绑定版本载荷是路径图。
    const cert = app.getCanonicalCert({ name: "gA", version: 1 });
    assert.ok(cert);
    const result = cert.result as { canonical?: string };
    assert.ok(result.canonical?.startsWith("n4|"));
    // 最新版（三棱柱）没有规范证书，但显式指定版本 1 可查旧证书。
    const latestCert = app.getCanonicalCert({ name: "gA" });
    assert.equal(latestCert, undefined);
    // 同构 K3,3 与三棱柱不同构（版本化反例）。
    app.saveGraph({ name: "k33", ...completeBipartite(3, 3) });
    const verdict = app.isomorphism({ name: "gA" }, { name: "k33" });
    assert.equal(verdict.status, "non-isomorphic");
    store.close();
  }
  rmSync(DB);
});

test("未决结果不落库冒充证书", () => {
  if (existsSync(DB)) rmSync(DB);
  const store = new Store(DB);
  const app = new App(store);
  app.saveGraph({ name: "big", n: 10, edges: [] });
  const result = app.automorphisms({ name: "big" }, { maxNodes: 2, maxMs: 60000, maxMappings: 10 });
  assert.equal(result.status, "undetermined");
  assert.equal(app.getAutomorphismCert({ name: "big" }), undefined);
  store.close();
  rmSync(DB);
});
