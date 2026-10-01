// 端到端演示（使用临时数据目录，不污染正式 data/）：
// 两张编号不同的同构图、一个非同构反例、预算未决、重启后继续查询证书。

import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { openDatabase } from "../db/database";
import { Repository } from "../db/repository";
import { IsoService } from "../core/service";
import { triangularPrism, k33, relabel, randomPermutation } from "../core/graphs";

function line(t: string) {
  console.log("\n=== " + t + " ===");
}

function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iso-demo-"));
  console.log("临时数据目录:", dir);

  const newService = () => {
    const handle = openDatabase(dir);
    return { service: new IsoService(new Repository(handle.db), { maxNodes: 2_000_000, maxMs: 10_000 }), close: () => handle.close() };
  };

  let ctx = newService();
  const s = ctx.service;

  // 图 A：三棱柱（编号原样）
  const a = s.addGraph("三棱柱", triangularPrism());
  // 图 A'：同一张三棱柱但顶点编号被随机重排
  const a2 = s.addGraph("三棱柱-重排", relabel(triangularPrism(), randomPermutation(6, 42)));
  // 图 B：K3,3（非同构反例）
  const b = s.addGraph("K3,3", k33());

  line("1) 两张编号不同的同构图");
  const iso = s.compare(a.version.id, a2.version.id);
  console.log("状态:", iso.status, "| 映射 源->目标:", JSON.stringify(iso.mapping));
  console.log("依据:", iso.reason);

  line("2) 非同构反例：三棱柱 vs K3,3（都是3-正则，度数序列相同）");
  const noniso = s.compare(a.version.id, b.version.id);
  console.log("状态:", noniso.status);
  console.log("依据:", noniso.reason);

  line("3) 规范化与自同构（证书落库）");
  const an1 = s.analyze(a.version.id);
  const an2 = s.analyze(a2.version.id);
  console.log("A  规范码:", an1.canonical.code);
  console.log("A' 规范码:", an2.canonical.code);
  console.log("规范码一致(与编号无关):", an1.canonical.code === an2.canonical.code);
  console.log("A  自同构总数:", an1.automorphism.count, "轨道:", JSON.stringify(an1.automorphism.orbits));

  line("4) 外部伪造双射被拒绝");
  const fake = s.verifyExternalMapping(a.version.id, b.version.id, [0, 1, 2, 3, 4, 5]);
  console.log("核验结果:", fake.ok, "| 原因:", fake.reason);

  line("5) 预算未决（故意极小预算，10 个孤立点 10! 分支）");
  const big = s.addGraph("十孤立点", { n: 10, edges: [] });
  const big2 = s.addGraph("十孤立点-重排", relabel({ n: 10, edges: [] }, randomPermutation(10, 7)));
  const undecided = s.compare(big.version.id, big2.version.id, { maxNodes: 3, maxMs: 20 });
  console.log("同构状态:", undecided.status, "|", undecided.reason);
  const undecidedCert = s.analyze(big2.version.id, { maxNodes: 3, maxMs: 20 });
  console.log("证书状态:", undecidedCert.status,
    "| 规范码:", undecidedCert.canonical.code ?? "(未发布)",
    "| 自同构总数:", undecidedCert.automorphism.count ?? "(未发布)");

  const versionId = a.version.id;
  ctx.close();

  line("6) 重启后继续查询既有证书（重新打开同一个 SQLite 文件）");
  ctx = newService();
  const cert = ctx.service.getCertificate(versionId);
  console.log("从磁盘读出的证书:");
  console.log(JSON.stringify(cert, null, 2));
  ctx.close();

  console.log("\n演示完成。");
}

main();
