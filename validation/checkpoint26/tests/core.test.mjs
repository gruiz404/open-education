import test from "node:test";
import assert from "node:assert/strict";
import {getFixture, wave1Ids} from "../fixtures/catalog.mjs";
import {createRun, executePrimary, executeRecovery, hashContent, stableStringify} from "../src/core.mjs";
import {renderExperienceHtml} from "../src/render.mjs";

const execute = async (testId) => {
  const run = await createRun(getFixture(testId));
  await executePrimary(run);
  const after = structuredClone(run.content);
  await executeRecovery(run);
  return {run, after};
};

test("el catálogo W1 contiene exactamente los ocho casos autorizados", () => {
  assert.deepEqual(wave1Ids, ["C1-T01", "C1-T03", "C1-T05", "C1-T07", "C2-T04", "C2-T10", "C3-T08", "C3-T11"]);
});

test("stableStringify no depende del orden de claves", () => {
  assert.equal(stableStringify({b: 2, a: 1}), stableStringify({a: 1, b: 2}));
});

test("C1-T01 ordena por valor y deshace hasta el hash inicial", async () => {
  const {run, after} = await execute("C1-T01");
  assert.deepEqual(after.record_order, ["R02", "R04", "R05", "R01", "R03"]);
  assert.equal(await hashContent(run.content), run.initial_hash);
  assert.deepEqual(run.events.map(({event_type}) => event_type), ["SORT_APPLIED", "UNDO_APPLIED"]);
});

test("C1-T03 filtra sin perder registros y restablece el conjunto", async () => {
  const {run, after} = await execute("C1-T03");
  assert.deepEqual(after.visible_record_ids, ["R01", "R03", "R05"]);
  assert.equal(run.content.records.length, 6);
  assert.equal(await hashContent(run.content), run.initial_hash);
  assert.deepEqual(run.events.map(({event_type}) => event_type), ["FILTER_APPLIED", "FILTER_REVERTED", "SNAPSHOT_CAPTURED"]);
});

test("C1-T05 cambia sólo la representación y recupera la tabla", async () => {
  const {run, after} = await execute("C1-T05");
  assert.equal(after.representation_id, "dot_plot");
  assert.equal(after.dataset_hash, run.initial_content.dataset_hash);
  assert.deepEqual(after.records.map(({record_id}) => record_id), run.initial_content.records.map(({record_id}) => record_id));
  assert.equal(await hashContent(run.content), run.initial_hash);
});

test("C1-T07 restaura la agrupación original y permite volver a la modificada", async () => {
  const {run, after} = await execute("C1-T07");
  assert.equal(after.grouping_id, "grouping_original");
  assert.deepEqual(after.records.map(({group}) => group), ["Norte", "Norte", "Sur", "Sur"]);
  assert.equal(run.content.grouping_id, "grouping_modified");
  assert.deepEqual(run.content.grouping_history, ["grouping_original", "grouping_modified"]);
  assert.equal(await hashContent(run.content), run.initial_hash);
});

test("C2-T04 conserva la ruta de avance y rehace la vista actual", async () => {
  const {run, after} = await execute("C2-T04");
  assert.equal(after.active_view_id, "view_previous");
  assert.deepEqual(after.navigation.forward, ["view_current"]);
  assert.equal(run.content.active_view_id, "view_current");
  assert.deepEqual(run.content.view_history, ["view_previous", "view_current"]);
  assert.equal(await hashContent(run.content), run.initial_hash);
});

test("C2-T10 restaura A sin borrar la versión B ni cambiar de ciclo", async () => {
  const {run, after} = await execute("C2-T10");
  assert.equal(after.active_question_version, 2);
  assert.equal(run.content.active_question_version, 1);
  assert.equal(run.content.question_version_counter, 2);
  assert.equal(run.content.question_versions.length, 2);
  assert.equal(run.content.cycle, 2);
});

test("C3-T08 reactiva v1 y conserva v2 como provisional", async () => {
  const {run, after} = await execute("C3-T08");
  assert.equal(after.active_relation_version, 2);
  assert.equal(run.content.active_relation_version, 1);
  assert.equal(run.content.relation_versions.length, 2);
  assert.ok(run.content.relation_versions.every(({status}) => status === "PROVISIONAL"));
  assert.equal(run.content.certification, "NONE");
});

test("C3-T11 reabre la hipótesis y conserva la trayectoria de cierre", async () => {
  const {run, after} = await execute("C3-T11");
  assert.equal(after.hypothesis_status, "CLOSED_PROVISIONAL");
  assert.equal(run.content.hypothesis_status, "OPEN_PROVISIONAL");
  assert.deepEqual(run.content.closure_history.map(({action}) => action), ["CLOSE_PROVISIONAL", "REOPEN_PROVISIONAL"]);
});

test("todos los eventos respetan los 17 campos, la secuencia y la procedencia", async () => {
  const required = [
    "schema_version", "run_id", "sequence", "monotonic_ms", "test_id", "cycle", "actor", "event_type",
    "input_payload", "before_state_hash", "after_state_hash", "provenance", "visible_criteria", "reversible",
    "undo_ref", "policy_decision_ref", "ui_snapshot_ref"
  ].sort();
  for (const testId of wave1Ids) {
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

test("la experiencia no incorpora puntuación, recomendación ni certificación", async () => {
  for (const testId of wave1Ids) {
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
