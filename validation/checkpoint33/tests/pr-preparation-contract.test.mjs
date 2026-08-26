import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const contract = JSON.parse(readFileSync(new URL("pr-preparation-contract.json", root)));
const proposed = readFileSync(new URL("proposed-pull-request.md", root), "utf8");
const checklist = readFileSync(new URL("review-checklist.md", root), "utf8");
const rollback = readFileSync(new URL("rollback-plan.md", root), "utf8");

test("gate and next gate are explicit", () => {
  assert.equal(contract.gate, "PASS_CONTROLLED_PR_PREPARATION");
  assert.equal(contract.next_gate, "ENABLE_CONTROLLED_PULL_REQUEST_OPENING_REVIEW");
});

test("candidate identity is immutable", () => {
  assert.equal(contract.proposed_pull_request.base, "main");
  assert.equal(contract.proposed_pull_request.head, "checkpoint-32-full-pre-merge-regression");
  assert.equal(contract.proposed_pull_request.head_sha, contract.official_cp32_commit);
  assert.equal(contract.proposed_pull_request.draft_only, true);
});

test("candidate delta is additive and exactly bounded", () => {
  assert.deepEqual(contract.expected_candidate_delta, {
    commits: 16, files: 100, insertions: 8222, deletions: 0,
    added: 100, modified: 0, deleted: 0, workflows: 8, validation_files: 92,
    allowed_prefixes: [".github/workflows/checkpoint", "validation/checkpoint"]
  });
});

test("CP32 regression evidence is fixed", () => {
  assert.equal(contract.cp32_run.conclusion, "success");
  assert.equal(contract.cp32_run.jobs, 6);
  assert.equal(contract.cp32_run.gate, "PASS_FULL_PRE_MERGE_REGRESSION");
  assert.match(contract.cp32_run.artifact_digest, /^sha256:[a-f0-9]{64}$/);
});

test("opening and merging remain prohibited", () => {
  for (const action of ["OPEN_PULL_REQUEST", "MERGE_TO_MAIN", "MODIFY_GITHUB_PAGES", "ENABLE_CYCLE_4"]) {
    assert.equal(contract.prohibited_actions.includes(action), true);
  }
  assert.match(proposed, /does not authorize opening or merging/i);
  assert.match(checklist, /later explicit gate authorizes opening/i);
});

test("rollback is non-destructive and preserves history", () => {
  const normalized = rollback.replace(/\s+/g, " ");
  assert.match(normalized, /revert the single merge commit/i);
  assert.match(normalized, /Do not rewrite `main`, force-push, or delete historical branches/i);
  assert.equal(contract.historical_branches_to_retain.length, 8);
});
