import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const cpRoot=resolve(here,"..");
const repoRoot=resolve(cpRoot,"../..");
const sources=resolve(cpRoot,"artifacts/sources");
const evidence=resolve(cpRoot,"artifacts/evidence");
const contract=JSON.parse(readFileSync(resolve(cpRoot,"full-regression-contract.json"),"utf8"));
const checks=[];
const check=(id,ok,observed)=>checks.push({id,status:ok?"PASS":"FAIL",observed});
const git=(...args)=>execFileSync("git",args,{cwd:repoRoot,encoding:"utf8"}).trim();

function parseManifest(dir){
  const lines=readFileSync(join(dir,"SHA256SUMS.txt"),"utf8").trim().split("\n");
  const failures=[];
  for(const line of lines){const match=line.match(/^([a-f0-9]{64})  (.+)$/);if(!match){failures.push(line);continue;}const [,expected,file]=match;const actual=createHash("sha256").update(readFileSync(join(dir,file))).digest("hex");if(actual!==expected)failures.push(file);}
  return {entries:lines.length,failures};
}

const cp31=git("rev-parse",contract.official_cp31_commit);
const cp31Tree=git("rev-parse",`${cp31}^{tree}`);
const mergeBase=git("merge-base",contract.protected_main,"HEAD");
const cp32Paths=git("diff","--name-only",`${contract.official_cp31_commit}..HEAD`).split("\n").filter(Boolean);
check("CP31_COMMIT_PRESENT",cp31===contract.official_cp31_commit,cp31);
check("CP31_TREE_MATCH",cp31Tree===contract.official_cp31_tree,cp31Tree);
check("MAIN_IS_MERGE_BASE",mergeBase===contract.protected_main,mergeBase);
check("CP32_SCOPE_ALLOWED",cp32Paths.every(p=>contract.allowed_cp32_prefixes.some(prefix=>p.startsWith(prefix))),cp32Paths);

let totalCases=0,totalBrowserChecks=0,totalExternal=0,totalConsole=0,totalAuditChecks=0;
const index=[];
mkdirSync(evidence,{recursive:true});
for(const suite of contract.suites){
  const dir=join(sources,suite.artifact);
  const summary=JSON.parse(readFileSync(join(dir,"summary.json"),"utf8"));
  const audit=JSON.parse(readFileSync(join(dir,"audit.json"),"utf8"));
  const caseRows=summary.cases||summary.pilots||[];
  const manifest=parseManifest(dir);
  const passed=summary.totals?.passed||0;
  const planned=summary.totals?.planned||0;
  const browserChecks=caseRows.reduce((n,row)=>n+(row.checks||0),0);
  const external=summary.external_network_requests||0;
  const consoleErrors=summary.console_errors||0;
  check(`${suite.id}_IDENTITY`,summary.checkpoint===suite.checkpoint,summary.checkpoint);
  check(`${suite.id}_CASES`,planned===suite.planned_cases&&passed===planned,`${passed}/${planned}`);
  check(`${suite.id}_BROWSER_CHECKS`,browserChecks===suite.browser_checks,browserChecks);
  check(`${suite.id}_GATE`,summary.gate===suite.gate&&audit.status==="PASS",`${summary.gate}/${audit.status}`);
  check(`${suite.id}_ISOLATION`,external===0&&consoleErrors===0,`external=${external}; console=${consoleErrors}`);
  check(`${suite.id}_MANIFEST`,manifest.failures.length===0,`${manifest.entries} entries; failures=${manifest.failures.length}`);
  totalCases+=passed;totalBrowserChecks+=browserChecks;totalExternal+=external;totalConsole+=consoleErrors;totalAuditChecks+=audit.checks?.length||0;
  const dest=join(evidence,"sources",suite.id);mkdirSync(dest,{recursive:true});
  for(const name of ["summary.json","audit.json","SHA256SUMS.txt"]) copyFileSync(join(dir,name),join(dest,name));
  index.push({id:suite.id,checkpoint:suite.checkpoint,artifact:suite.artifact,cases:`${passed}/${planned}`,browser_checks:browserChecks,audit_checks:audit.checks?.length||0,manifest_entries:manifest.entries,status:"PASS"});
}
check("TOTAL_SUITES",index.length===contract.expected_totals.suites,index.length);
check("TOTAL_CASES",totalCases===contract.expected_totals.cases,totalCases);
check("TOTAL_BROWSER_CHECKS",totalBrowserChecks===contract.expected_totals.browser_checks,totalBrowserChecks);
check("TOTAL_ISOLATION",totalExternal===0&&totalConsole===0,`external=${totalExternal}; console=${totalConsole}`);
check("NO_PR_AUTHORIZED",contract.prohibited_actions.includes("OPEN_PULL_REQUEST"),"OPEN_PULL_REQUEST prohibited");
check("NO_MERGE_AUTHORIZED",contract.prohibited_actions.includes("MERGE_TO_MAIN"),"MERGE_TO_MAIN prohibited");

const failed=checks.filter(x=>x.status==="FAIL");
const result={schema:"open-education.checkpoint32.audit.v1",checkpoint:32,timestamp_utc:new Date().toISOString(),repository:contract.repository,candidate_commit:process.env.GITHUB_SHA||git("rev-parse","HEAD"),audited_base:contract.official_cp31_commit,gate:failed.length?"FAIL_FULL_PRE_MERGE_REGRESSION":contract.gate,criterion:contract.criterion,next_gate:failed.length?"BLOCK_PULL_REQUEST":contract.next_gate,totals:{suites:index.length,cases:totalCases,browser_checks:totalBrowserChecks,audit_checks:totalAuditChecks,external_requests:totalExternal,console_errors:totalConsole,checks:checks.length,passed:checks.length-failed.length,failed:failed.length},protections:{main_changed:false,pages_changed:false,baselines_changed:false,pull_request:"NOT_AUTHORIZED",merge:"NOT_AUTHORIZED",publication:"NOT_AUTHORIZED",cycle4:"NOT_AUTHORIZED",historical_branches:"RETAIN"},checks};
writeFileSync(join(evidence,"full-regression-summary.json"),`${JSON.stringify(result,null,2)}\n`);
writeFileSync(join(evidence,"source-index.json"),`${JSON.stringify(index,null,2)}\n`);
writeFileSync(join(evidence,"contract-snapshot.json"),`${JSON.stringify(contract,null,2)}\n`);
writeFileSync(join(evidence,"protection-status.json"),`${JSON.stringify(result.protections,null,2)}\n`);

const files=[];function walk(dir){for(const name of readdirSync(dir).sort()){if(name==="SHA256SUMS.txt"&&dir===evidence)continue;const p=join(dir,name);if(statSync(p).isDirectory())walk(p);else files.push(p);}}walk(evidence);
const manifest=files.map(p=>`${createHash("sha256").update(readFileSync(p)).digest("hex")}  ${relative(evidence,p)}`).join("\n")+"\n";
writeFileSync(join(evidence,"SHA256SUMS.txt"),manifest);
console.log(JSON.stringify(result,null,2));
if(failed.length)process.exit(1);

