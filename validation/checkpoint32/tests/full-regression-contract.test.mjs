import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contract = JSON.parse(readFileSync(new URL("../full-regression-contract.json", import.meta.url)));

test("gate and next gate are explicit", () => {
  assert.equal(contract.gate, "PASS_FULL_PRE_MERGE_REGRESSION");
  assert.equal(contract.next_gate, "ENABLE_CONTROLLED_PULL_REQUEST_PREPARATION");
});

test("five suites cover 22 cases and 410 checks", () => {
  assert.equal(contract.suites.length, 5);
  assert.equal(contract.suites.reduce((n, s) => n + s.planned_cases, 0), 22);
  assert.equal(contract.suites.reduce((n, s) => n + s.browser_checks, 0), 410);
});

test("all contracts CP25 through CP32 are required", () => {
  assert.deepEqual(contract.required_contract_tests, [25,26,27,28,29,30,31,32]);
});

test("pull request and merge remain prohibited", () => {
  for (const action of ["OPEN_PULL_REQUEST","MERGE_TO_MAIN","MODIFY_GITHUB_PAGES","ENABLE_CYCLE_4"]) {
    assert.equal(contract.prohibited_actions.includes(action), true);
  }
});

