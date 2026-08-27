import test from "node:test";
import assert from "node:assert/strict";
import {getFixture} from "../fixtures/catalog.mjs";
import {createRun, executePrimary, executeRecovery, hashContent, stableStringify} from "../src/core.mjs";
import {renderExperienceHtml, visualMetrics} from "../src/render.mjs";

test("stableStringify no depende del orden de claves", () => {
  assert.equal(stableStringify({b: 2, a: 1}), stableStringify({a: 1, b: 2}));
});

test("C1-T03 filtra, conserva record_ids y recupera el hash inicial", async () => {
  const run = await createRun(getFixture("C1-T03"));
  const initialIds = run.content.records.map((record) => record.record_id);
  await executePrimary(run);
  assert.deepEqual(run.content.visible_record_ids, ["R01", "R03", "R05"]);
  assert.deepEqual(run.content.records.map((record) => record.record_id), initialIds);
  await executeRecovery(run);
  assert.equal(await hashContent(run.content), run.initial_hash);
  assert.deepEqual(run.events.map((event) => event.event_type), ["FILTER_APPLIED", "FILTER_REVERTED", "SNAPSHOT_CAPTURED"]);
  assert.equal(run.events.length, run.history_refs.length);
});

test("C2-T02 no convierte el default en elección y neutraliza opciones", async () => {
  const run = await createRun(getFixture("C2-T02"));
  await executePrimary(run);
  assert.equal(run.content.reader_choice, null);
  assert.equal(run.content.interaction_enabled, false);
  await executeRecovery(run);
  assert.equal(run.content.default_option, null);
  assert.equal(run.content.reader_choice, null);
  assert.equal(run.content.interaction_enabled, true);
  assert.ok(run.content.options.every((option) => option.salience_token === "neutral"));
  const refs = visualMetrics(run).options.map((option) => JSON.stringify(option.computed_reference));
  assert.equal(refs[0], refs[1]);
  assert.deepEqual(run.events.map((event) => event.event_type), ["SALIENCE_VIOLATION_DETECTED", "INTERACTION_BLOCKED", "OPTIONS_NEUTRALIZED"]);
});

test("C3-T04 impide montar Ciclo 4 sin sustituto en la experiencia", async () => {
  const run = await createRun(getFixture("C3-T04"));
  await executePrimary(run);
  await executeRecovery(run);
  assert.equal(run.content.cycle4_enabled, false);
  assert.equal(run.content.hypothesis_status, "UNEVALUATED");
  assert.ok(!run.content.mounted_components.includes("prediction_prompt"));
  const html = renderExperienceHtml(run).toLowerCase();
  assert.ok(!html.includes('data-component="prediction"'));
  assert.ok(!html.includes('data-action="contrast"'));
  assert.deepEqual(run.events.map((event) => event.event_type), ["UNAUTHORIZED_COMPONENT_DETECTED", "COMPONENT_MOUNT_BLOCKED", "LIMIT_RECORDED"]);
});

test("todos los eventos respetan los 17 campos y secuencia determinista", async () => {
  const required = [
    "schema_version", "run_id", "sequence", "monotonic_ms", "test_id", "cycle", "actor", "event_type",
    "input_payload", "before_state_hash", "after_state_hash", "provenance", "visible_criteria", "reversible",
    "undo_ref", "policy_decision_ref", "ui_snapshot_ref"
  ].sort();
  for (const testId of ["C1-T03", "C2-T02", "C3-T04"]) {
    const run = await createRun(getFixture(testId));
    await executePrimary(run);
    await executeRecovery(run);
    run.events.forEach((event, index) => {
      assert.deepEqual(Object.keys(event).sort(), required);
      assert.equal(event.sequence, index + 1);
      assert.equal(event.monotonic_ms, (index + 1) * 100);
      assert.match(event.before_state_hash, /^[a-f0-9]{64}$/);
      assert.match(event.after_state_hash, /^[a-f0-9]{64}$/);
    });
  }
});

test("la aplicación no conoce el oráculo y registra cero red externa", async () => {
  const run = await createRun(getFixture("C1-T03"));
  assert.equal(run.oracle_access, false);
  assert.deepEqual(run.network_requests, []);
});
