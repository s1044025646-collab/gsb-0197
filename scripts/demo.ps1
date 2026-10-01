# 图同构后端端到端演示（Windows PowerShell）
# 用法: npm run demo
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot/..

$env:GISO_DB = "data/demo.db"
if (Test-Path data/demo.db) { Remove-Item data/demo.db,data/demo.db-wal,data/demo.db-shm -ErrorAction SilentlyContinue }

function Show($title) { Write-Host "`n==== $title ====" -ForegroundColor Cyan }

Show "1) Build two isomorphic P4 graphs with different numbering"
'{"n":4,"edges":[{"u":0,"v":1},{"u":1,"v":2},{"u":2,"v":3}]}' | Out-File -Encoding utf8 data/p4.json
'{"n":4,"edges":[{"u":3,"v":0},{"u":0,"v":2},{"u":2,"v":1}]}' | Out-File -Encoding utf8 data/p4b.json
npx tsx src/cli.ts create p4 data/p4.json
npx tsx src/cli.ts create p4b data/p4b.json

Show "2) Isomorphism query (color-preserving bijection, edge-by-edge verified)"
npx tsx src/cli.ts iso p4 p4b

Show "3) Canonical labels: identical despite different input numbering"
npx tsx src/cli.ts canonical p4
npx tsx src/cli.ts canonical p4b

Show "4) Non-isomorphic counter-example: triangular prism vs K3,3"
'{"n":6,"edges":[{"u":0,"v":1},{"u":1,"v":2},{"u":2,"v":0},{"u":3,"v":4},{"u":4,"v":5},{"u":5,"v":3},{"u":0,"v":3},{"u":1,"v":4},{"u":2,"v":5}]}' | Out-File -Encoding utf8 data/prism.json
'{"n":6,"edges":[{"u":0,"v":3},{"u":0,"v":4},{"u":0,"v":5},{"u":1,"v":3},{"u":1,"v":4},{"u":1,"v":5},{"u":2,"v":3},{"u":2,"v":4},{"u":2,"v":5}]}' | Out-File -Encoding utf8 data/k33.json
npx tsx src/cli.ts create prism data/prism.json | Out-Null
npx tsx src/cli.ts create k33 data/k33.json | Out-Null
npx tsx src/cli.ts iso prism k33

Show "5) Automorphism analysis: K3,3 has 72 automorphisms (single transitive orbit)"
npx tsx src/cli.ts auto k33

Show "6) External mapping verification: fake bijection rejected"
"[0,1,2,3]" | Out-File -Encoding utf8 data/fake.json
npx tsx src/cli.ts verify p4 p4b data/fake.json

Show "7) Budget undetermined: tiny node budget on K10 returns undetermined"
'{"maxNodes":3,"maxMs":60000,"maxMappings":10}' | Out-File -Encoding utf8 data/tiny-budget.json
'{"n":10,"edges":[]}' | Out-File -Encoding utf8 data/k10empty.json
npx tsx src/cli.ts create k10 data/k10empty.json | Out-Null
npx tsx src/cli.ts auto k10 --budget-json data/tiny-budget.json

Show "8) Reopen SQLite (simulated restart) and query existing certificates"
npx tsx src/cli.ts list
npx tsx src/cli.ts cert 1
npx tsx src/cli.ts cert-canonical p4

Write-Host "`nDemo finished. Database: data/demo.db" -ForegroundColor Green
