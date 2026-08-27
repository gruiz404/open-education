import {createHash} from "node:crypto";
import {mkdir, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(await readFile(path.join(packageRoot, "closure-contract.json"), "utf8"));
const sourceRoot = path.join(packageRoot, "source-artifacts");
const repository = process.env.GITHUB_REPOSITORY || "gruiz404/open-education";
const token = process.env.GITHUB_TOKEN;

if (!token) throw new Error("GITHUB_TOKEN is required to retrieve official workflow artifacts.");
if (repository !== "gruiz404/open-education") throw new Error(`Unexpected repository: ${repository}`);

await rm(sourceRoot, {recursive: true, force: true});
await mkdir(sourceRoot, {recursive: true});

const apiBase = `https://api.github.com/repos/${repository}`;
const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "Open-Education-Checkpoint30"
};

const get = async (url) => {
  const response = await fetch(url, {headers, redirect: "follow"});
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response;
};

const mainRef = await (await get(`${apiBase}/git/ref/heads/main`)).json();
if (mainRef.object?.sha !== contract.protected_main_sha) {
  throw new Error(`Protected main changed: ${mainRef.object?.sha}`);
}

const waves = [];
for (const wave of contract.waves) {
  const run = await (await get(`${apiBase}/actions/runs/${wave.run_id}`)).json();
  const artifact = await (await get(`${apiBase}/actions/artifacts/${wave.artifact_id}`)).json();

  const metadataOk = run.status === "completed"
    && run.conclusion === "success"
    && run.head_branch === wave.branch
    && run.head_sha === wave.commit
    && artifact.id === wave.artifact_id
    && artifact.name === wave.artifact_name
    && artifact.expired === false
    && artifact.workflow_run?.id === wave.run_id
    && artifact.digest === `sha256:${wave.artifact_sha256}`;
  if (!metadataOk) throw new Error(`Remote metadata mismatch for ${wave.id}`);

  const bytes = Buffer.from(await (await get(`${apiBase}/actions/artifacts/${wave.artifact_id}/zip`)).arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== wave.artifact_sha256) throw new Error(`Artifact digest mismatch for ${wave.id}`);
  if (bytes.length !== wave.artifact_size) throw new Error(`Artifact size mismatch for ${wave.id}`);
  await writeFile(path.join(sourceRoot, wave.artifact_file), bytes);

  waves.push({
    id: wave.id,
    checkpoint: wave.checkpoint,
    run_id: wave.run_id,
    run_url: run.html_url,
    run_status: run.status,
    run_conclusion: run.conclusion,
    branch: run.head_branch,
    commit: run.head_sha,
    artifact_id: artifact.id,
    artifact_name: artifact.name,
    artifact_digest: artifact.digest,
    artifact_size: bytes.length,
    status: "PASS"
  });
}

await writeFile(path.join(sourceRoot, "remote-metadata.json"), `${JSON.stringify({
  schema_version: "oe-irp-f2-remote-metadata-0.1",
  repository,
  protected_main_sha: mainRef.object.sha,
  status: "PASS",
  waves
}, null, 2)}\n`);

process.stdout.write(`Retrieved and verified ${waves.length} official artifacts.\n`);
