import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(await readFile(path.join(root, "closure-contract.json"), "utf8"));
const cases = contract.waves.flatMap(({cases: waveCases}) => waveCases);

test("Checkpoint 30 closes F2 without creating a fifth wave", () => {
  assert.equal(contract.checkpoint, 30);
  assert.equal(contract.phase, "F2");
  assert.deepEqual(contract.waves.map(({id}) => id), ["W1", "W2", "W3", "W4"]);
});

test("the four waves partition exactly 19 unique cases", () => {
  assert.equal(cases.length, 19);
  assert.equal(new Set(cases).size, 19);
  assert.deepEqual(contract.waves.map(({cases: waveCases}) => waveCases.length), [8, 6, 3, 2]);
});

test("expected browser controls total 361", () => {
  assert.equal(contract.waves.reduce((sum, {browser_checks}) => sum + browser_checks, 0), 361);
  assert.ok(contract.waves.every(({cases: waveCases, browser_checks}) => browser_checks === waveCases.length * 19));
});

test("expected audits and manifests have fixed aggregate counts", () => {
  assert.equal(contract.waves.reduce((sum, {audit_checks}) => sum + audit_checks, 0), 65);
  assert.equal(contract.waves.reduce((sum, {manifest_entries}) => sum + manifest_entries, 0), 441);
  assert.equal(contract.waves.reduce((sum, {artifact_files}) => sum + artifact_files, 0), 449);
});

test("wave gate chain reaches consolidated closure only", () => {
  assert.deepEqual(contract.waves.map(({next_gate}) => next_gate), [
    "ENABLE_F2_W2",
    "ENABLE_F2_W3",
    "ENABLE_F2_W4",
    "ENABLE_F2_CONSOLIDATED_CLOSURE"
  ]);
});

test("all four artifacts have pinned identities and SHA-256 digests", () => {
  for (const wave of contract.waves) {
    assert.match(wave.artifact_sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(wave.run_id));
    assert.ok(Number.isSafeInteger(wave.artifact_id));
    assert.match(wave.commit, /^[a-f0-9]{40}$/);
  }
});

test("twelve transversal controls are traceable to known evidence", () => {
  const validRefs = new Set([...contract.waves.map(({id}) => id), ...cases]);
  assert.equal(contract.transversal_controls.length, 12);
  assert.equal(new Set(contract.transversal_controls.map(({id}) => id)).size, 12);
  assert.ok(contract.transversal_controls.every(({evidence}) => evidence.length && evidence.every((ref) => validRefs.has(ref))));
});

test("closure preserves the post-F2 decision boundary", () => {
  assert.equal(contract.gate, "PASS_F2_CONSOLIDATED_CLOSURE");
  assert.equal(contract.criterion, "F2_19_CASES_4_WAVES_TRACEABLE_CONFORM");
  assert.equal(contract.next_gate, "REQUIRE_POST_F2_SCOPE_DECISION");
  assert.equal(contract.next_gate.includes("CYCLE4"), false);
  assert.equal(contract.protected_main_sha, "72e4d3410b74f9de4252c93f484304339d71cf1b");
});
