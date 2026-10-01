// API 启动入口：端口与数据目录可通过环境变量/参数配置。

import * as path from "path";
import { openDatabase } from "../db/database";
import { Repository } from "../db/repository";
import { IsoService, DEFAULT_BUDGET } from "../core/service";
import { createServer } from "./server";

function main() {
  const port = Number(process.env.PORT ?? process.argv[2] ?? 3000);
  const dataDir = path.resolve(
    process.env.DATA_DIR ?? process.argv[3] ?? path.join(process.cwd(), "data")
  );
  const maxNodes = Number(process.env.BUDGET_NODES ?? DEFAULT_BUDGET.maxNodes);
  const maxMs = Number(process.env.BUDGET_MS ?? DEFAULT_BUDGET.maxMs);

  const handle = openDatabase(dataDir);
  const repo = new Repository(handle.db);
  const service = new IsoService(repo, { maxNodes, maxMs });
  const server = createServer({ service });

  server.listen(port, () => {
    console.log(`图同构后端已启动: http://localhost:${port}`);
    console.log(`数据目录: ${dataDir}`);
    console.log(`预算: nodes<=${maxNodes}, time<=${maxMs}ms`);
  });

  const shutdown = () => {
    server.close(() => {
      handle.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
