import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contract = JSON.parse(readFileSync(new URL("../integration-readiness-contract.json", import.meta.url)));

test("checkpoint and gate are fixed", () => {
  assert.equal(contract.checkpoint, 31);
  assert.equal(contract.gate, "PASS_F2_INTEGRATION_READINESS_AUDIT");
  assert.equal(contract.next_gate, "ENABLE_FULL_PRE_MERGE_REGRESSION");
});

test("branch chain is complete and ordered", () => {
  assert.deepEqual(contract.branch_chain.map(({ branch }) => branch), [
    "main",
    "checkpoint-25-browser-validation",
    "checkpoint-26-f2-wave1",
    "checkpoint-27-f2-wave2",
    "checkpoint-28-f2-wave3",
    "checkpoint-29-f2-wave4",
    "checkpoint-30-f2-consolidated-closure"
  ]);
  assert.equal(contract.branch_chain.reduce((sum, item) => sum + item.ahead_from_previous, 0), 12);
});

test("integration delta is additive and bounded", () => {
  assert.equal(contract.expected_diff.files, 86);
  assert.equal(contract.expected_diff.insertions, 7712);
  assert.equal(contract.expected_diff.deletions, 0);
  assert.equal(contract.expected_diff.behind_by, 0);
});

test("all historical branches are retained", () => {
  assert.equal(contract.historical_branches_to_retain.length, 6);
  assert.equal(contract.prohibited_actions.includes("DELETE_HISTORICAL_BRANCHES"), true);
});

test("no integration or publication is authorized", () => {
  for (const action of ["MERGE_TO_MAIN", "MODIFY_GITHUB_PAGES", "PUBLISH_RELEASE", "ENABLE_CYCLE_4"]) {
    assert.equal(contract.prohibited_actions.includes(action), true);
  }
});

