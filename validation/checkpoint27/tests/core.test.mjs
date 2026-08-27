import test from "node:test";
import assert from "node:assert/strict";
import {getFixture, wave2Ids} from "../fixtures/catalog.mjs";
import {createRun, executePrimary, executeRecovery, hashContent, stableStringify} from "../src/core.mjs";
import {renderExperienceHtml, renderShellHtml} from "../src/render.mjs";

const execute = async (testId) => {
  const run = await createRun(getFixture(testId));
  const before = structuredClone(run.content);
  await executePrimary(run);
  const after = structuredClone(run.content);
  await executeRecovery(run);
  return {run, before, after};
};

test("el catálogo W2 contiene exactamente los seis casos autorizados", () => {
  assert.deepEqual(wave2Ids, ["C1-T06", "C1-T08", "C2-T02", "C2-T05", "C2-T06", "C3-T06"]);
});

test("stableStringify no depende del orden de claves", () => {
  assert.equal(stableStringify({b: 2, a: 1}), stableStringify({a: 1, b: 2}));
});

test("C1-T06 selecciona B sin inferir comprensión y deshace", async () => {
  const {run, after} = await execute("C1-T06");
  assert.equal(after.view_id, "view_B");
  assert.equal(after.cognition_claim, "NONE");
  assert.equal(await hashContent(run.content), run.initial_hash);
  assert.deepEqual(run.events.map(({event_type}) => event_type), ["VIEW_SELECTED", "ACTION_RECORDED", "UNDO_AVAILABLE", "UNDO_APPLIED"]);
});

test("C1-T08 conserva vistas y observación del lector al cerrar", async () => {
  const {run, after} = await execute("C1-T08");
  assert.equal(after.comparison_open, true);
  assert.equal(after.observation.provenance, "READER");
  assert.equal(run.content.comparison_open, false);
  assert.equal(run.content.views.length, 2);
  assert.equal(run.content.observation.provenance, "READER");
});

test("C2-T02 bloquea el default, neutraliza sin elección y remonta limpio", async () => {
  const run = await createRun(getFixture("C2-T02"));
  assert.equal(run.content.default_option, "view_B");
  assert.equal(run.content.interaction_enabled, false);
  assert.deepEqual(run.events.map(({event_type}) => event_type), ["SALIENCE_VIOLATION_DETECTED", "INTERACTION_BLOCKED"]);
  assert.ok(!renderExperienceHtml(run).includes('data-action="primary"'));
  assert.ok(renderShellHtml(run).includes('class="technical-action" data-action="primary"'));
  await executePrimary(run);
  assert.equal(run.content.default_option, null);
  assert.equal(run.content.reader_choice, null);
  assert.equal(run.content.interaction_enabled, true);
  await executeRecovery(run);
  assert.equal(run.content.clean_snapshot, true);
  assert.equal(run.content.reader_choice, null);
});

test("C2-T05 selecciona B sin atribuir comprensión y deshace", async () => {
  const {run, after} = await execute("C2-T05");
  assert.equal(after.grouping_id, "option_B");
  assert.equal(after.cognition_claim, "NONE");
  assert.equal(await hashContent(run.content), run.initial_hash);
});

test("C2-T06 conserva límite, snapshots y retorno a la vista anterior", async () => {
  const {run, after} = await execute("C2-T06");
  assert.equal(after.visibility_limit.provenance, "READER");
  assert.equal(after.return_option_exposed, true);
  assert.equal(run.content.active_view_id, "view_individual");
  assert.equal(run.content.visibility_limit.provenance, "READER");
  assert.deepEqual(run.content.snapshots, ["view_individual", "view_grouped"]);
});

test("C3-T06 mantiene conjuntos equilibrados sin confirmar validez", async () => {
  const {run, after} = await execute("C3-T06");
  assert.equal(after.comparison_open, true);
  assert.equal(after.supporting_ids.length, after.contradicting_ids.length);
  assert.equal(after.salience_audit, "PASS");
  assert.equal(after.confirmation, "NONE");
  assert.equal(run.content.comparison_open, false);
  assert.deepEqual(run.content.supporting_ids, ["S1", "S2"]);
  assert.deepEqual(run.content.contradicting_ids, ["C1", "C2"]);
});

test("todos los eventos respetan los 17 campos, secuencia y procedencia", async () => {
  const required = [
    "schema_version", "run_id", "sequence", "monotonic_ms", "test_id", "cycle", "actor", "event_type",
    "input_payload", "before_state_hash", "after_state_hash", "provenance", "visible_criteria", "reversible",
    "undo_ref", "policy_decision_ref", "ui_snapshot_ref"
  ].sort();
  for (const testId of wave2Ids) {
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

test("las opciones son pares explícitos y sólo C2-T02 monta saliencia desigual", async () => {
  for (const testId of wave2Ids) {
    const run = await createRun(getFixture(testId));
    const html = renderExperienceHtml(run);
    assert.equal((html.match(/data-neutral-option/g) || []).length, 2);
    assert.equal((html.match(/data-default-option/g) || []).length, testId === "C2-T02" ? 1 : 0);
    await executePrimary(run);
    assert.equal((renderExperienceHtml(run).match(/data-default-option/g) || []).length, 0);
  }
});

test("la experiencia no incorpora puntuación, recomendación ni certificación", async () => {
  for (const testId of wave2Ids) {
    const run = await createRun(getFixture(testId));
    for (const phase of ["before", "after", "recovery"]) {
      if (phase === "after") await executePrimary(run);
      if (phase === "recovery") await executeRecovery(run);
      const html = renderExperienceHtml(run).toLowerCase();
      assert.ok(!html.includes("data-score"));
      assert.ok(!html.includes("data-recommendation"));
      assert.ok(!html.includes("data-certification"));
    }
    assert.equal(run.oracle_access, false);
    assert.deepEqual(run.network_requests, []);
  }
});
