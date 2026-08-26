import test from "node:test";
import assert from "node:assert/strict";
import {getFixture, wave3Ids} from "../fixtures/catalog.mjs";
import {createRun, executePrimary, executeRecovery, stableStringify} from "../src/core.mjs";
import {renderExperienceHtml} from "../src/render.mjs";

const execute = async (testId) => {
  const run = await createRun(getFixture(testId));
  await executePrimary(run);
  const after = structuredClone(run.content);
  await executeRecovery(run);
  return {run, after, recovery: structuredClone(run.content)};
};

test("el catálogo W3 contiene exactamente los tres casos autorizados", () => {
  assert.deepEqual(wave3Ids, ["C2-T01", "C2-T11", "C3-T03"]);
});

test("stableStringify no depende del orden de claves", () => {
  assert.equal(stableStringify({b: 2, a: 1}), stableStringify({a: 1, b: 2}));
});

test("C2-T01 revela sólo clave, pertenencia y elementos preservados", async () => {
  const {after} = await execute("C2-T01");
  assert.deepEqual(after.revealed_fields, ["grouping_key", "grouping_membership", "record_ids_preserved"]);
  assert.equal(after.factual_disclosure_count, 1);
  assert.equal(after.interpretation, "NONE");
  assert.equal(after.recommendation, "NONE");
  assert.equal(after.relation_claim, "NONE");
  assert.deepEqual(after.record_ids, ["R01", "R02", "R03", "R04"]);
});

test("C2-T11 revela únicamente dimensión D y mantiene C/E ocultas", async () => {
  const {after} = await execute("C2-T11");
  assert.deepEqual(after.revealed_fields, ["dimension_D"]);
  assert.equal(after.requested_field, "dimension_D");
  assert.ok(!after.revealed_fields.includes("dimension_C"));
  assert.ok(!after.revealed_fields.includes("dimension_E"));
  assert.equal(after.disclosure_scope, "EXACT_REQUEST_ONLY");
});

test("C3-T03 revela únicamente C sin completar la hipótesis", async () => {
  const {after} = await execute("C3-T03");
  assert.deepEqual(after.revealed_fields, ["dimension_C"]);
  assert.equal(after.hypothesis_status, "PROVISIONAL");
  assert.equal(after.hypothesis_confirmation, "NONE");
  assert.equal(after.interpretation, "NONE");
  assert.equal(after.recommendation, "NONE");
});

test("las secuencias de eventos coinciden con el contrato W3", async () => {
  const expected = {
    "C2-T01": ["FACT_REQUESTED", "FACT_REVEALED", "PROVENANCE_RECORDED", "DISCLOSURE_HIDDEN"],
    "C2-T11": ["FACT_REQUESTED", "ALLOWLIST_CHECKED", "FACT_REVEALED", "DISCLOSURE_HIDDEN"],
    "C3-T03": ["FACT_REQUESTED", "ALLOWLIST_CHECKED", "FACT_REVEALED", "DISCLOSURE_HIDDEN"]
  };
  for (const testId of wave3Ids) {
    const {run} = await execute(testId);
    assert.deepEqual(run.events.map(({event_type}) => event_type), expected[testId]);
  }
});

test("todos los eventos respetan los 17 campos y la secuencia", async () => {
  const required = [
    "schema_version", "run_id", "sequence", "monotonic_ms", "test_id", "cycle", "actor", "event_type",
    "input_payload", "before_state_hash", "after_state_hash", "provenance", "visible_criteria", "reversible",
    "undo_ref", "policy_decision_ref", "ui_snapshot_ref"
  ].sort();
  for (const testId of wave3Ids) {
    const {run} = await execute(testId);
    run.events.forEach((event, index) => {
      assert.deepEqual(Object.keys(event).sort(), required);
      assert.equal(event.sequence, index + 1);
      assert.equal(event.monotonic_ms, (index + 1) * 100);
      assert.match(event.before_state_hash, /^[a-f0-9]{64}$/);
      assert.match(event.after_state_hash, /^[a-f0-9]{64}$/);
      assert.ok(event.provenance.length > 0);
    });
  }
});

test("la recuperación oculta la revelación y conserva el historial", async () => {
  for (const testId of wave3Ids) {
    const {run, recovery} = await execute(testId);
    assert.equal(recovery.disclosure_open, false);
    assert.equal(recovery.requested_field, null);
    assert.deepEqual(recovery.revealed_fields, []);
    assert.equal(run.history_refs.length, run.events.length);
    assert.ok(run.history_refs.length >= 4);
    if (testId === "C2-T01") assert.equal(recovery.factual_disclosure_count, 1);
    if (testId === "C3-T03") assert.equal(recovery.hypothesis_status, "PROVISIONAL");
  }
});

test("la experiencia no incorpora marcadores prohibidos", async () => {
  for (const testId of wave3Ids) {
    const run = await createRun(getFixture(testId));
    for (const phase of ["before", "after", "recovery"]) {
      if (phase === "after") await executePrimary(run);
      if (phase === "recovery") await executeRecovery(run);
      const html = renderExperienceHtml(run).toLowerCase();
      for (const marker of ["data-score", "data-recommendation", "data-certification", "data-confirmation"]) {
        assert.ok(!html.includes(marker));
      }
    }
  }
});

test("toda revelación primaria es ALLOW mínimo y queda dentro de su allowlist", async () => {
  for (const testId of wave3Ids) {
    const run = await createRun(getFixture(testId));
    await executePrimary(run);
    assert.equal(run.fixture.primary_decision, "ALLOW");
    assert.ok(run.content.revealed_fields.every((field) => run.content.allowlist.includes(field)));
    assert.equal(run.content.interpretation, "NONE");
    assert.equal(run.content.recommendation, "NONE");
    assert.equal(run.oracle_access, false);
    assert.deepEqual(run.network_requests, []);
  }
});
