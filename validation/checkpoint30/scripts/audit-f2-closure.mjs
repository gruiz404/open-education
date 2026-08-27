import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {copyFile, mkdir, readFile, readdir, rm, stat, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(packageRoot, "source-artifacts");
const extractedRoot = path.join(sourceRoot, "extracted");
const outputRoot = path.join(packageRoot, "closure-results");
const contract = JSON.parse(await readFile(path.join(packageRoot, "closure-contract.json"), "utf8"));
const remote = JSON.parse(await readFile(path.join(sourceRoot, "remote-metadata.json"), "utf8"));

const checks = [];
const check = (id, ok, detail) => checks.push({check_id: id, status: ok ? "PASS" : "FAIL", detail});
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const sameMembers = (actual, expected) => actual.length === expected.length
  && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
const listFiles = async (root) => {
  const found = [];
  const walk = async (dir) => {
    for (const item of await readdir(dir, {withFileTypes: true})) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) await walk(full);
      else if (item.isFile()) found.push(full);
    }
  };
  await walk(root);
  return found.sort();
};

await rm(extractedRoot, {recursive: true, force: true});
await rm(outputRoot, {recursive: true, force: true});
await mkdir(extractedRoot, {recursive: true});
await mkdir(path.join(outputRoot, "sources"), {recursive: true});

check("REMOTE_METADATA", remote.status === "PASS" && remote.repository === "gruiz404/open-education" && remote.waves?.length === 4, `${remote.status}; ${remote.waves?.length ?? 0} waves`);
check("PROTECTED_MAIN", remote.protected_main_sha === contract.protected_main_sha, remote.protected_main_sha);

const allCases = [];
const sourceIndex = [];
let totalBrowserChecks = 0;
let totalAuditChecks = 0;
let totalManifestEntries = 0;
let totalArtifactFiles = 0;
let totalExternalRequests = 0;
let totalConsoleErrors = 0;

for (const wave of contract.waves) {
  const zipPath = path.join(sourceRoot, wave.artifact_file);
  const zipBytes = await readFile(zipPath);
  const zipStat = await stat(zipPath);
  check(`${wave.id}_ARTIFACT_DIGEST`, sha256(zipBytes) === wave.artifact_sha256, sha256(zipBytes));
  check(`${wave.id}_ARTIFACT_SIZE`, zipStat.size === wave.artifact_size, `${zipStat.size}/${wave.artifact_size}`);

  const remoteWave = remote.waves.find(({id}) => id === wave.id);
  const remoteOk = remoteWave?.status === "PASS"
    && remoteWave.run_id === wave.run_id
    && remoteWave.run_conclusion === "success"
    && remoteWave.branch === wave.branch
    && remoteWave.commit === wave.commit
    && remoteWave.artifact_id === wave.artifact_id
    && remoteWave.artifact_digest === `sha256:${wave.artifact_sha256}`;
  check(`${wave.id}_REMOTE_IDENTITY`, remoteOk, `run=${remoteWave?.run_id}; artifact=${remoteWave?.artifact_id}; ${remoteWave?.run_conclusion}`);

  const extractDir = path.join(extractedRoot, wave.id.toLowerCase());
  await mkdir(extractDir, {recursive: true});
  const unzip = spawnSync("unzip", ["-q", "-o", zipPath, "-d", extractDir], {encoding: "utf8"});
  check(`${wave.id}_ZIP_STRUCTURE`, unzip.status === 0, unzip.status === 0 ? "unzip OK" : unzip.stderr.trim());

  const manifestText = await readFile(path.join(extractDir, "SHA256SUMS.txt"), "utf8");
  const manifestLines = manifestText.trim().split("\n");
  const manifestMismatches = [];
  for (const line of manifestLines) {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    if (!match) { manifestMismatches.push(`invalid:${line}`); continue; }
    const resolved = path.resolve(extractDir, match[2]);
    if (!resolved.startsWith(`${path.resolve(extractDir)}${path.sep}`)) { manifestMismatches.push(`unsafe:${match[2]}`); continue; }
    try {
      if (sha256(await readFile(resolved)) !== match[1]) manifestMismatches.push(match[2]);
    } catch {
      manifestMismatches.push(`missing:${match[2]}`);
    }
  }
  check(`${wave.id}_MANIFEST`, manifestMismatches.length === 0 && manifestLines.length === wave.manifest_entries, manifestMismatches.length ? manifestMismatches.join(", ") : `${manifestLines.length}/${wave.manifest_entries}`);

  const artifactFiles = await listFiles(extractDir);
  check(`${wave.id}_FILE_COUNT`, artifactFiles.length === wave.artifact_files, `${artifactFiles.length}/${wave.artifact_files}`);

  const summary = await readJson(path.join(extractDir, "summary.json"));
  const audit = await readJson(path.join(extractDir, "audit.json"));
  const summaryCases = summary.cases.map(({test_id}) => test_id);
  const browserChecks = summary.cases.reduce((sum, item) => sum + item.checks, 0);
  const summaryOk = summary.checkpoint === wave.checkpoint
    && summary.wave?.id === wave.id
    && summary.browser_validation === "PASS"
    && summary.gate === wave.gate
    && summary.wave_gate === wave.wave_gate
    && summary.next_gate === wave.next_gate
    && summary.totals?.planned === wave.cases.length
    && summary.totals?.passed === wave.cases.length
    && summary.totals?.failed === 0
    && browserChecks === wave.browser_checks
    && summary.cases.every(({status, checks: count}) => status === "PASS" && count === 19)
    && sameMembers(summaryCases, wave.cases);
  check(`${wave.id}_SUMMARY`, summaryOk, `${summary.totals?.passed}/${summary.totals?.planned}; checks=${browserChecks}; ${summary.gate}`);

  const auditOk = audit.status === "PASS"
    && audit.gate === wave.gate
    && audit.next_gate === wave.next_gate
    && audit.checks.length === wave.audit_checks
    && audit.checks.every(({status}) => status === "PASS");
  check(`${wave.id}_AUDIT`, auditOk, `${audit.checks.length}/${wave.audit_checks}; ${audit.status}`);

  const protectionsOk = summary.main_changed === false
    && summary.pages_changed === false
    && summary.baselines_changed === false
    && summary.publication === "NOT_AUTHORIZED"
    && summary.external_network_requests === 0
    && summary.console_errors === 0;
  check(`${wave.id}_PROTECTIONS`, protectionsOk, `main=${summary.main_changed}; pages=${summary.pages_changed}; baselines=${summary.baselines_changed}; publication=${summary.publication}; external=${summary.external_network_requests}; console=${summary.console_errors}`);

  const sourceOut = path.join(outputRoot, "sources", `CP${wave.checkpoint}_${wave.id}`);
  await mkdir(sourceOut, {recursive: true});
  for (const file of ["summary.json", "audit.json", "SHA256SUMS.txt"]) await copyFile(path.join(extractDir, file), path.join(sourceOut, file));

  allCases.push(...summaryCases);
  totalBrowserChecks += browserChecks;
  totalAuditChecks += audit.checks.length;
  totalManifestEntries += manifestLines.length;
  totalArtifactFiles += artifactFiles.length;
  totalExternalRequests += summary.external_network_requests;
  totalConsoleErrors += summary.console_errors;
  sourceIndex.push({
    wave: wave.id,
    checkpoint: wave.checkpoint,
    run_id: wave.run_id,
    run_url: `https://github.com/gruiz404/open-education/actions/runs/${wave.run_id}`,
    branch: wave.branch,
    commit: wave.commit,
    artifact_id: wave.artifact_id,
    artifact_name: wave.artifact_name,
    artifact_sha256: wave.artifact_sha256,
    artifact_files: artifactFiles.length,
    manifest_entries: manifestLines.length,
    cases: summaryCases,
    browser_checks: browserChecks,
    audit_checks: audit.checks.length,
    status: summaryOk && auditOk && protectionsOk && manifestMismatches.length === 0 ? "PASS" : "FAIL"
  });
}

const expectedCases = contract.waves.flatMap(({cases}) => cases);
check("CASE_PARTITION", sameMembers(allCases, expectedCases) && new Set(allCases).size === 19, `${new Set(allCases).size}/19 unique; ${allCases.length}/19 total`);
check("AGGREGATE_BROWSER_CHECKS", totalBrowserChecks === 361, `${totalBrowserChecks}/361`);
check("AGGREGATE_AUDIT_CHECKS", totalAuditChecks === 65, `${totalAuditChecks}/65`);
check("AGGREGATE_MANIFEST", totalManifestEntries === 441, `${totalManifestEntries}/441`);
check("AGGREGATE_FILES", totalArtifactFiles === 449, `${totalArtifactFiles}/449`);
check("AGGREGATE_ISOLATION", totalExternalRequests === 0 && totalConsoleErrors === 0, `external=${totalExternalRequests}; console=${totalConsoleErrors}`);

const chain = contract.waves.map(({next_gate}) => next_gate);
check("GATE_CHAIN", JSON.stringify(chain) === JSON.stringify(["ENABLE_F2_W2", "ENABLE_F2_W3", "ENABLE_F2_W4", "ENABLE_F2_CONSOLIDATED_CLOSURE"]), chain.join(" > "));

const evidenceRefs = new Set([...contract.waves.map(({id}) => id), ...expectedCases]);
const tcIds = contract.transversal_controls.map(({id}) => id);
const transversalOk = contract.transversal_controls.length === 12
  && new Set(tcIds).size === 12
  && contract.transversal_controls.every(({evidence}) => evidence.length > 0 && evidence.every((ref) => evidenceRefs.has(ref)));
check("TRANSVERSAL_TRACEABILITY", transversalOk, `${new Set(tcIds).size}/12 controls`);
check("POST_F2_BOUNDARY", contract.next_gate === "REQUIRE_POST_F2_SCOPE_DECISION" && !contract.next_gate.includes("CYCLE4"), contract.next_gate);

const status = checks.every(({status: itemStatus}) => itemStatus === "PASS") ? "PASS" : "FAIL";
const summary = {
  schema_version: "oe-irp-f2-consolidated-summary-0.1",
  checkpoint: 30,
  phase: "F2",
  status,
  gate: status === "PASS" ? contract.gate : "FAIL",
  criterion: contract.criterion,
  next_gate: status === "PASS" ? contract.next_gate : "REMEDIATE_F2_CLOSURE",
  totals: {
    waves: contract.waves.length,
    cases_planned: 19,
    cases_passed: status === "PASS" ? 19 : allCases.length,
    browser_checks: totalBrowserChecks,
    wave_audit_checks: totalAuditChecks,
    manifest_entries: totalManifestEntries,
    artifact_files: totalArtifactFiles,
    external_network_requests: totalExternalRequests,
    console_errors: totalConsoleErrors,
    transversal_controls: contract.transversal_controls.length
  },
  protected_main_sha: contract.protected_main_sha,
  protections: {main_changed: false, pages_changed: false, baselines_changed: false, publication: "NOT_AUTHORIZED", cycle4_enabled: false},
  waves: sourceIndex.map(({wave, checkpoint, run_id, status: waveStatus, cases, browser_checks}) => ({wave, checkpoint, run_id, status: waveStatus, cases: cases.length, browser_checks})),
  limits: contract.limits
};
const audit = {
  schema_version: "oe-irp-f2-consolidated-audit-0.1",
  checkpoint: 30,
  phase: "F2",
  auditor: "IRP-F2-CONSOLIDATED-EXTERNAL-AUDITOR",
  auditor_version: "0.1.0",
  status,
  checks,
  gate: summary.gate,
  criterion: contract.criterion,
  next_gate: summary.next_gate,
  limits: contract.limits
};

await copyFile(path.join(sourceRoot, "remote-metadata.json"), path.join(outputRoot, "remote-metadata.json"));
await writeFile(path.join(outputRoot, "source-index.json"), `${JSON.stringify(sourceIndex, null, 2)}\n`);
await writeFile(path.join(outputRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(path.join(outputRoot, "audit.json"), `${JSON.stringify(audit, null, 2)}\n`);

const rootManifest = path.join(outputRoot, "SHA256SUMS.txt");
const outputFiles = (await listFiles(outputRoot)).filter((file) => file !== rootManifest);
const sums = [];
for (const file of outputFiles) sums.push(`${sha256(await readFile(file))}  ${path.relative(outputRoot, file).split(path.sep).join("/")}`);
await writeFile(path.join(outputRoot, "SHA256SUMS.txt"), `${sums.join("\n")}\n`);

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
process.exit(status === "PASS" ? 0 : 1);
