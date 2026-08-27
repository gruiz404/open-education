import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contract = JSON.parse(readFileSync(new URL("../controlled-pr-authorization-contract.json", import.meta.url)));

test("the precise CP32 candidate is fixed", () => {
  assert.equal(contract.candidate_branch, "checkpoint-32-full-pre-merge-regression");
  assert.equal(contract.candidate_commit, "42c61ad7fbe7ec8caf14e1ff0942fa3b4249bbf6");
  assert.equal(contract.candidate_tree, "2f3aeef8111e8478943ba79e90d73195e29038cf");
});

test("opening and merging a pull request remain prohibited", () => {
  assert.equal(contract.prohibited_actions.includes("OPEN_PULL_REQUEST"), true);
  assert.equal(contract.prohibited_actions.includes("MERGE_TO_MAIN"), true);
  assert.equal(contract.authorization.open_pull_request, "USER_EXPLICIT_AUTHORIZATION_REQUIRED");
});

test("the CP34 scope is isolated", () => {
  assert.deepEqual(contract.allowed_cp34_prefixes, [".github/workflows/checkpoint34-", "validation/checkpoint34/"]);
  assert.deepEqual(contract.required_contract_tests, [25,26,27,28,29,30,31,32,33,34]);
});
