import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const cpRoot=resolve(here,"..");
const repoRoot=resolve(cpRoot,"../..");
const evidence=resolve(cpRoot,"artifacts/evidence");
const contract=JSON.parse(readFileSync(resolve(cpRoot,"pr-preparation-contract.json"),"utf8"));
const checks=[];
const check=(id,ok,observed)=>checks.push({id,status:ok?"PASS":"FAIL",observed});
const git=(...args)=>execFileSync("git",args,{cwd:repoRoot,encoding:"utf8"}).trim();

const parent=git("rev-parse","HEAD^");
const parentTree=git("rev-parse",`${parent}^{tree}`);
const mergeBase=git("merge-base",contract.protected_main,parent);
const candidatePaths=git("diff","--name-only",`${contract.protected_main}..${parent}`).split("\n").filter(Boolean);
const candidateStatuses=git("diff","--name-status",`${contract.protected_main}..${parent}`).split("\n").filter(Boolean);
const numstat=git("diff","--numstat",`${contract.protected_main}..${parent}`).split("\n").filter(Boolean);
const cp33Paths=git("diff","--name-only",`${parent}..HEAD`).split("\n").filter(Boolean);
const commits=Number(git("rev-list","--count",`${contract.protected_main}..${parent}`));
const additions=numstat.reduce((n,line)=>n+Number(line.split("\t")[0]),0);
const deletions=numstat.reduce((n,line)=>n+Number(line.split("\t")[1]),0);
const statusCounts={A:0,M:0,D:0};
for(const line of candidateStatuses){const status=line.split("\t")[0][0];statusCounts[status]=(statusCounts[status]||0)+1;}
const workflows=candidatePaths.filter(p=>p.startsWith(".github/workflows/")).length;
const validationFiles=candidatePaths.filter(p=>p.startsWith("validation/")).length;
const allowed=candidatePaths.every(p=>contract.expected_candidate_delta.allowed_prefixes.some(prefix=>p.startsWith(prefix)));
const cp33Allowed=cp33Paths.every(p=>contract.allowed_cp33_prefixes.some(prefix=>p.startsWith(prefix)));

check("CP32_PARENT_IDENTITY",process.env.GITHUB_ACTIONS==="true"?parent===contract.official_cp32_commit:parentTree===contract.official_cp32_tree,parent);
check("CP32_PARENT_TREE",parentTree===contract.official_cp32_tree,parentTree);
check("MAIN_IS_MERGE_BASE",mergeBase===contract.protected_main,mergeBase);
check("CANDIDATE_COMMITS",commits===contract.expected_candidate_delta.commits,commits);
check("CANDIDATE_FILES",candidatePaths.length===contract.expected_candidate_delta.files,candidatePaths.length);
check("CANDIDATE_INSERTIONS",additions===contract.expected_candidate_delta.insertions,additions);
check("CANDIDATE_DELETIONS",deletions===0,deletions);
check("CANDIDATE_STATUS",statusCounts.A===100&&(statusCounts.M||0)===0&&(statusCounts.D||0)===0,statusCounts);
check("CANDIDATE_PATHS",allowed,candidatePaths);
check("CANDIDATE_SPLIT",workflows===8&&validationFiles===92,{workflows,validation_files:validationFiles});
check("CP32_REGRESSION",contract.cp32_run.conclusion==="success"&&contract.cp32_run.jobs===6&&contract.cp32_run.gate==="PASS_FULL_PRE_MERGE_REGRESSION",contract.cp32_run);
check("CP33_SCOPE",cp33Allowed,cp33Paths);
check("PR_DRAFT_ONLY",contract.proposed_pull_request.draft_only===true,"no PR opened");
check("NO_OPEN_AUTHORIZED",contract.prohibited_actions.includes("OPEN_PULL_REQUEST"),"OPEN_PULL_REQUEST prohibited");
check("NO_MERGE_AUTHORIZED",contract.prohibited_actions.includes("MERGE_TO_MAIN"),"MERGE_TO_MAIN prohibited");
check("ROLLBACK_READY",readFileSync(resolve(cpRoot,"rollback-plan.md"),"utf8").replace(/\s+/g," ").includes("revert the single merge commit"),"non-destructive revert plan present");

const failed=checks.filter(x=>x.status==="FAIL");
const protections={main_changed:false,pages_changed:false,baselines_changed:false,pull_request:"NOT_AUTHORIZED",merge:"NOT_AUTHORIZED",publication:"NOT_AUTHORIZED",cycle4:"NOT_AUTHORIZED",historical_branches:"RETAIN"};
const result={schema:"open-education.checkpoint33.audit.v1",checkpoint:33,timestamp_utc:new Date().toISOString(),repository:contract.repository,candidate:{branch:contract.head_branch,commit:contract.official_cp32_commit,tree:contract.official_cp32_tree},audited_parent:parent,base:{branch:contract.base_branch,commit:contract.protected_main},gate:failed.length?"FAIL_CONTROLLED_PR_PREPARATION":contract.gate,criterion:contract.criterion,next_gate:failed.length?"BLOCK_PULL_REQUEST":contract.next_gate,delta:{commits,files:candidatePaths.length,insertions:additions,deletions,status_counts:statusCounts,workflows,validation_files:validationFiles},cp32_run:contract.cp32_run,protections,totals:{checks:checks.length,passed:checks.length-failed.length,failed:failed.length},checks};
mkdirSync(evidence,{recursive:true});
writeFileSync(join(evidence,"pr-preparation-audit.json"),JSON.stringify(result,null,2)+"\n");
writeFileSync(join(evidence,"candidate-delta.tsv"),candidateStatuses.join("\n")+"\n");
writeFileSync(join(evidence,"candidate-diff-stat.txt"),git("diff","--stat",`${contract.protected_main}..${parent}`)+"\n");
writeFileSync(join(evidence,"pr-metadata.json"),JSON.stringify(contract.proposed_pull_request,null,2)+"\n");
writeFileSync(join(evidence,"protection-status.json"),JSON.stringify(protections,null,2)+"\n");
writeFileSync(join(evidence,"risk-register.json"),JSON.stringify([
  {id:"R1",risk:"Candidate identity changes before opening",level:"MEDIUM",mitigation:"Re-run CP33 and require exact SHA"},
  {id:"R2",risk:"GitHub Actions artifact expiration",level:"MEDIUM",mitigation:"Preserve packaged CP32 and CP33 evidence with hashes"},
  {id:"R3",risk:"Unexpected workflow behavior after integration",level:"LOW",mitigation:"Use reviewed revert PR; never rewrite main"},
  {id:"R4",risk:"Historical traceability loss",level:"LOW",mitigation:"Retain all checkpoint branches"}
],null,2)+"\n");
for(const name of ["proposed-pull-request.md","review-checklist.md","rollback-plan.md"]) copyFileSync(resolve(cpRoot,name),join(evidence,name));

const files=[];
function walk(dir){for(const name of readdirSync(dir).sort()){if(name==="SHA256SUMS.txt"&&dir===evidence)continue;const p=join(dir,name);statSync(p).isDirectory()?walk(p):files.push(p);}}walk(evidence);
const manifest=files.map(p=>`${createHash("sha256").update(readFileSync(p)).digest("hex")}  ${relative(evidence,p)}`).join("\n")+"\n";
writeFileSync(join(evidence,"SHA256SUMS.txt"),manifest);
console.log(JSON.stringify(result,null,2));
if(failed.length)process.exit(1);
