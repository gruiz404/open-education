import {createHash} from "node:crypto";
import {access, readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(packageRoot, "browser-results");
const oracle = JSON.parse(await readFile(path.join(packageRoot, "browser", "contract-oracle.json"), "utf8"));
const caseIds = Object.keys(oracle.cases);
const checks = [];
const check = (id, ok, detail) => checks.push({check_id: id, status: ok ? "PASS" : "FAIL", detail});
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

const requiredPerCase = [
  "checks.json", "events.ndjson",
  ...["before", "after", "recovery"].flatMap((phase) => [
    `state_${phase}.json`, `dom_${phase}.html`, `aria_${phase}_actual.json`,
    `aria_${phase}_playwright.yml`, `computed_${phase}.json`,
    `screenshots/${phase}.png`, `screenshots/${phase}_experience.png`
  ])
];

const summary = await readJson(path.join(root, "summary.json"));
check("SUMMARY_GATE", summary.browser_validation === "PASS" && summary.gate === "PASS_W2_BROWSER" && summary.wave_gate === "VISUAL_EQUIVALENCE_NO_INDUCTION", `${summary.browser_validation}/${summary.gate}/${summary.wave_gate}`);
check("WAVE_IDENTITY", summary.checkpoint === 27 && summary.wave?.id === "W2" && summary.totals?.planned === 6 && summary.totals?.passed === 6, `CP${summary.checkpoint}; ${summary.wave?.id}; ${summary.totals?.passed}/${summary.totals?.planned}`);
check("BROWSER_IDENTITY", summary.browser?.engine === "Chromium" && Boolean(summary.browser?.version), `${summary.browser?.engine} ${summary.browser?.version}`);
check("ISOLATION", summary.external_network_requests === 0 && summary.console_errors === 0, `external=${summary.external_network_requests}; console_errors=${summary.console_errors}`);
check("PROTECTION", summary.baselines_changed === false && summary.main_changed === false && summary.pages_changed === false && summary.publication === "NOT_AUTHORIZED", "Baselines, main, Pages y publicación sin cambios");
check("ORACLE_IDENTITY", oracle.checkpoint === 27 && oracle.wave === "W2" && caseIds.length === 6 && oracle.source.includes("CP23"), `CP${oracle.checkpoint}; ${oracle.wave}; ${caseIds.length} casos; ${oracle.source}`);

for (const testId of caseIds) {
  const dir = path.join(root, testId);
  const missing = [];
  for (const file of requiredPerCase) {
    try { await access(path.join(dir, file)); } catch { missing.push(file); }
  }
  check(`${testId}_FILES`, missing.length === 0, missing.length ? missing.join(", ") : `${requiredPerCase.length}/${requiredPerCase.length}`);
  const result = await readJson(path.join(dir, "checks.json"));
  const failed = result.checks.filter(({status}) => status !== "PASS");
  check(`${testId}_CHECKS`, result.status === "PASS" && result.checks.length === 19 && failed.length === 0, failed.length ? failed.map(({check_id}) => check_id).join(", ") : `${result.checks.length}/19`);
}

const sums = (await readFile(path.join(root, "SHA256SUMS.txt"), "utf8")).trim().split("\n");
const mismatches = [];
for (const line of sums) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  if (!match) { mismatches.push(`línea inválida: ${line}`); continue; }
  const actual = createHash("sha256").update(await readFile(path.join(root, match[2]))).digest("hex");
  if (actual !== match[1]) mismatches.push(match[2]);
}
check("CHECKSUMS", mismatches.length === 0 && sums.length === 139, mismatches.length ? mismatches.join(", ") : `${sums.length}/139`);

const status = checks.every(({status: itemStatus}) => itemStatus === "PASS") ? "PASS" : "FAIL";
const result = {
  schema_version: "oe-irp-f2-browser-audit-0.3",
  checkpoint: 27,
  wave: "W2",
  auditor: "IRP-F2-BROWSER-EXTERNAL-AUDITOR",
  auditor_version: "0.3.0",
  status,
  checks,
  gate: status === "PASS" ? "PASS_W2_BROWSER" : "FAIL",
  next_gate: status === "PASS" ? "ENABLE_F2_W3" : "REMEDIATE_AND_REPEAT_W2",
  limits: [
    "No certifica comprensión, preferencia, logro cognitivo ni validez del sistema publicado.",
    "Ciclo 4 permanece deshabilitado; main, Pages y baselines permanecen sin cambios."
  ]
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(status === "PASS" ? 0 : 1);
