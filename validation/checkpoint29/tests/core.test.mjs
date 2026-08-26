import test from "node:test";
import assert from "node:assert/strict";
import {getFixture, wave4Ids} from "../fixtures/catalog.mjs";
import {createRun, executePrimary, executeRecovery, stableStringify} from "../src/core.mjs";
import {renderExperienceHtml} from "../src/render.mjs";

const execute = async (testId) => {
  const run = await createRun(getFixture(testId));
  await executePrimary(run);
  const after = structuredClone(run.content);
  await executeRecovery(run);
  return {run, after, recovery: structuredClone(run.content)};
};

test("el catálogo W4 contiene exactamente los dos casos autorizados", () => {
  assert.deepEqual(wave4Ids, ["C2-T09", "C3-T04"]);
});

test("stableStringify no depende del orden de claves", () => {
  assert.equal(stableStringify({b: 2, a: 1}), stableStringify({a: 1, b: 2}));
});

test("ambos casos aplican BLOCK y mantienen deshabilitado el Ciclo 4", async () => {
  for (const testId of wave4Ids) {
    const {run, after, recovery} = await execute(testId);
    assert.equal(run.fixture.primary_decision, "BLOCK");
    for (const state of [after, recovery]) {
      assert.equal(state.cycle4_enabled, false);
      assert.equal(state.prohibited_component_present, false);
      assert.ok(!state.mounted_components.includes("prediction_prompt"));
      assert.equal(state.prompt_present, false);
      assert.equal(state.substitute_present, false);
      assert.equal(state.contrast_control_present, false);
      assert.equal(state.evaluation_control_present, false);
      assert.equal(state.promotion_performed, false);
      assert.equal(state.certification, "NONE");
    }
  }
});

test("las secuencias de eventos coinciden con el contrato W4", async () => {
  const expected = ["UNAUTHORIZED_COMPONENT_DETECTED", "COMPONENT_MOUNT_BLOCKED", "LIMIT_RECORDED"];
  for (const testId of wave4Ids) {
    const {run} = await execute(testId);
    assert.deepEqual(run.events.map(({event_type}) => event_type), expected);
    assert.equal(run.history_refs.length, 3);
  }
});

test("todos los eventos respetan los 17 campos y la secuencia", async () => {
  const required = [
    "schema_version", "run_id", "sequence", "monotonic_ms", "test_id", "cycle", "actor", "event_type",
    "input_payload", "before_state_hash", "after_state_hash", "provenance", "visible_criteria", "reversible",
    "undo_ref", "policy_decision_ref", "ui_snapshot_ref"
  ].sort();
  for (const testId of wave4Ids) {
    const {run} = await execute(testId);
    run.events.forEach((event, index) => {
      assert.deepEqual(Object.keys(event).sort(), required);
      assert.equal(event.sequence, index + 1);
      assert.equal(event.monotonic_ms, (index + 1) * 100);
      assert.match(event.before_state_hash, /^[a-f0-9]{64}$/);
      assert.match(event.after_state_hash, /^[a-f0-9]{64}$/);
      assert.ok(event.provenance.length > 0);
      assert.equal(event.reversible, false);
      assert.equal(event.undo_ref, null);
    });
  }
});

test("C2-T09 continúa en C2 sin ruta forzada", async () => {
  const {after, recovery} = await execute("C2-T09");
  assert.equal(after.active_cycle, 2);
  assert.equal(after.forced_route, "NONE");
  assert.equal(recovery.active_cycle, 2);
  assert.equal(recovery.forced_route, "NONE");
});

test("C3-T04 conserva la hipótesis provisional sin promoción ni evaluación", async () => {
  const {after, recovery} = await execute("C3-T04");
  assert.equal(after.active_cycle, 3);
  assert.equal(after.hypothesis_status, "PROVISIONAL");
  assert.equal(after.hypothesis_confirmation, "NONE");
  assert.equal(recovery.hypothesis_status, "PROVISIONAL");
  assert.equal(recovery.hypothesis_confirmation, "NONE");
});

test("la experiencia no incorpora ningún componente, sustituto o control prohibido", async () => {
  const forbidden = [
    "prediction_prompt", "data-prediction", "name=\"prediction", "data-contrast-control",
    "data-evaluation-control", "data-score", "data-certification", "data-promotion",
    "escribe tu predicción", "contrasta tu predicción", "¿qué ocurrirá"
  ];
  for (const testId of wave4Ids) {
    const run = await createRun(getFixture(testId));
    for (const phase of ["before", "after", "recovery"]) {
      if (phase === "after") await executePrimary(run);
      if (phase === "recovery") await executeRecovery(run);
      const html = renderExperienceHtml(run).toLowerCase();
      for (const marker of forbidden) assert.ok(!html.includes(marker), `${testId}/${phase}: ${marker}`);
    }
  }
});

test("la aplicación no accede al oráculo ni a red externa", async () => {
  for (const testId of wave4Ids) {
    const run = await createRun(getFixture(testId));
    await executePrimary(run);
    assert.equal(run.oracle_access, false);
    assert.deepEqual(run.network_requests, []);
  }
});
