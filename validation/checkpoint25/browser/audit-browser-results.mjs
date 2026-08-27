import {createHash} from "node:crypto";
import {access, readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(packageRoot, "browser-results");
const pilotIds = ["C1-T03", "C2-T02", "C3-T04"];
const checks = [];
const check = (id, ok, detail) => checks.push({check_id: id, status: ok ? "PASS" : "FAIL", detail});
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

const requiredPerPilot = [
  "checks.json", "events.ndjson",
  ...["before", "after", "recovery"].flatMap((phase) => [
    `state_${phase}.json`, `dom_${phase}.html`, `aria_${phase}_actual.json`,
    `aria_${phase}_playwright.yml`, `computed_${phase}.json`,
    `screenshots/${phase}.png`, `screenshots/${phase}_experience.png`
  ])
];

const summary = await readJson(path.join(root, "summary.json"));
check("SUMMARY_GATE", summary.browser_validation === "PASS" && summary.gate === "PASS_BROWSER_SENTINELS", `${summary.browser_validation}/${summary.gate}`);
check("BROWSER_IDENTITY", summary.browser?.engine === "Chromium" && Boolean(summary.browser?.version), `${summary.browser?.engine} ${summary.browser?.version}`);
check("ISOLATION", summary.external_network_requests === 0 && summary.console_errors === 0, `external=${summary.external_network_requests}; console_errors=${summary.console_errors}`);
check("BASELINE_PROTECTION", summary.baselines_changed === false && summary.publication === "NOT_AUTHORIZED", "Baselines y publicación sin cambios");

for (const testId of pilotIds) {
  const dir = path.join(root, testId);
  const missing = [];
  for (const file of requiredPerPilot) {
    try { await access(path.join(dir, file)); } catch { missing.push(file); }
  }
  check(`${testId}_FILES`, missing.length === 0, missing.length ? missing.join(", ") : `${requiredPerPilot.length}/${requiredPerPilot.length}`);
  const pilot = await readJson(path.join(dir, "checks.json"));
  const failed = pilot.checks.filter((item) => item.status !== "PASS");
  check(`${testId}_CHECKS`, pilot.status === "PASS" && failed.length === 0, failed.length ? failed.map((item) => item.check_id).join(", ") : `${pilot.checks.length}/${pilot.checks.length}`);
}

const sums = (await readFile(path.join(root, "SHA256SUMS.txt"), "utf8")).trim().split("\n");
const mismatches = [];
for (const line of sums) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  if (!match) { mismatches.push(`línea inválida: ${line}`); continue; }
  const actual = createHash("sha256").update(await readFile(path.join(root, match[2]))).digest("hex");
  if (actual !== match[1]) mismatches.push(match[2]);
}
check("CHECKSUMS", mismatches.length === 0, mismatches.length ? mismatches.join(", ") : `${sums.length}/${sums.length}`);

const status = checks.every((item) => item.status === "PASS") ? "PASS" : "FAIL";
const result = {
  schema_version: "oe-irp-f2-browser-audit-0.1",
  checkpoint: 25,
  auditor: "IRP-F2-BROWSER-EXTERNAL-AUDITOR",
  auditor_version: "0.1.0",
  status,
  checks,
  gate: status === "PASS" ? "PASS_BROWSER_SENTINELS" : "FAIL",
  next_gate: status === "PASS" ? "ENABLE_F2_FOUR_WAVES" : "REMEDIATE_AND_REPEAT_SENTINELS",
  limits: ["No certifica comprensión, logro cognitivo ni validez del sistema publicado.", "Ciclo 4 permanece deshabilitado."]
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(status === "PASS" ? 0 : 1);
