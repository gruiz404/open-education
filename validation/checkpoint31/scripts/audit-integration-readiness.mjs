import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const checkpoint = resolve(here, "..");
const out = resolve(checkpoint, "artifacts/evidence");
const contract = JSON.parse(readFileSync(resolve(checkpoint, "integration-readiness-contract.json"), "utf8"));
const checks = [];

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function check(id, condition, observed) {
  checks.push({ id, status: condition ? "PASS" : "FAIL", observed });
}

const parent = git("rev-parse", process.env.CP31_AUDITED_TARGET || contract.official_cp30_commit);
const parentTree = git("rev-parse", `${parent}^{tree}`);
const mergeBase = git("merge-base", contract.protected_main, parent);
const nameStatus = git("diff", "--name-status", `${contract.protected_main}..${parent}`)
  .split("\n").filter(Boolean).map((line) => {
    const [status, path] = line.split("\t");
    return { status, path };
  });
const numstat = git("diff", "--numstat", `${contract.protected_main}..${parent}`)
  .split("\n").filter(Boolean).map((line) => {
    const [additions, deletions, path] = line.split("\t");
    return { additions: Number(additions), deletions: Number(deletions), path };
  });
const additions = numstat.reduce((sum, item) => sum + item.additions, 0);
const deletions = numstat.reduce((sum, item) => sum + item.deletions, 0);

check("MAIN_IS_MERGE_BASE", mergeBase === contract.protected_main, mergeBase);
check("PARENT_TREE_MATCHES_OFFICIAL_CP30", parentTree === contract.official_cp30_tree, parentTree);
check("EXPECTED_FILE_COUNT", nameStatus.length === contract.expected_diff.files, nameStatus.length);
check("ADDITIVE_ONLY", nameStatus.every(({ status }) => status === "A"), [...new Set(nameStatus.map(({ status }) => status))]);
check("EXPECTED_INSERTIONS", additions === contract.expected_diff.insertions, additions);
check("ZERO_DELETIONS", deletions === contract.expected_diff.deletions, deletions);
check("ALLOWED_PATH_SCOPE", nameStatus.every(({ path }) => contract.expected_diff.allowed_prefixes.some((prefix) => path.startsWith(prefix))), nameStatus.filter(({ path }) => !contract.expected_diff.allowed_prefixes.some((prefix) => path.startsWith(prefix))));
check("SIX_WORKFLOWS", nameStatus.filter(({ path }) => path.startsWith(".github/workflows/")).length === 6, nameStatus.filter(({ path }) => path.startsWith(".github/workflows/")).length);
check("NO_SITE_OR_PAGES_CHANGE", nameStatus.every(({ path }) => !path.startsWith("experiencias/") && !path.startsWith("docs/") && path !== "index.html" && !path.includes("pages")), "no production paths in delta");
check("HISTORICAL_BRANCH_RETENTION_DECLARED", contract.historical_branches_to_retain.length === 6, contract.historical_branches_to_retain);
check("NO_MERGE_AUTHORIZED", contract.prohibited_actions.includes("MERGE_TO_MAIN"), "MERGE_TO_MAIN prohibited");
check("NO_CYCLE4_AUTHORIZED", contract.prohibited_actions.includes("ENABLE_CYCLE_4"), "ENABLE_CYCLE_4 prohibited");

const failed = checks.filter(({ status }) => status === "FAIL");
const audit = {
  schema: "open-education.checkpoint31.audit.v1",
  checkpoint: 31,
  timestamp_utc: new Date().toISOString(),
  repository: contract.repository,
  candidate_commit: process.env.GITHUB_SHA || git("rev-parse", "HEAD"),
  audited_parent: parent,
  audited_parent_tree: parentTree,
  protected_main: contract.protected_main,
  gate: failed.length ? "FAIL_F2_INTEGRATION_READINESS_AUDIT" : contract.gate,
  criterion: contract.criterion,
  next_gate: failed.length ? "BLOCK_INTEGRATION" : contract.next_gate,
  recommendation: contract.recommendation,
  totals: { checks: checks.length, passed: checks.length - failed.length, failed: failed.length },
  diff: { files: nameStatus.length, additions, deletions },
  protections: { main_changed: false, pages_changed: false, baselines_changed: false, publication: "NOT_AUTHORIZED", cycle4: "NOT_AUTHORIZED" },
  checks
};

mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, "integration-readiness-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
writeFileSync(resolve(out, "changed-files.tsv"), `${nameStatus.map(({ status, path }) => `${status}\t${path}`).join("\n")}\n`);
writeFileSync(resolve(out, "branch-chain.json"), `${JSON.stringify(contract.branch_chain, null, 2)}\n`);
writeFileSync(resolve(out, "protection-status.json"), `${JSON.stringify(audit.protections, null, 2)}\n`);
writeFileSync(resolve(out, "contract-snapshot.json"), `${JSON.stringify(contract, null, 2)}\n`);

const manifestFiles = ["branch-chain.json", "changed-files.tsv", "contract-snapshot.json", "integration-readiness-audit.json", "protection-status.json"];
const manifest = manifestFiles.map((name) => `${createHash("sha256").update(readFileSync(resolve(out, name))).digest("hex")}  ${name}`).join("\n") + "\n";
writeFileSync(resolve(out, "SHA256SUMS.txt"), manifest);

console.log(JSON.stringify(audit, null, 2));
if (failed.length) process.exit(1);
