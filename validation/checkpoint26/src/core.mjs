const EVENT_SCHEMA_VERSION = "oe-irp-f2-event-0.2";

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export async function sha256Text(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashContent(content) {
  return sha256Text(stableStringify(content));
}

const clone = (value) => structuredClone(value);

function allProvenance(content) {
  const values = new Set(["fixture:OE001-F2"]);
  for (const record of content.records || []) {
    for (const ref of record.provenance || []) values.add(ref);
  }
  return [...values].sort();
}

export async function createRun(fixture) {
  const content = clone(fixture.initial_content);
  return {
    schema_version: "oe-irp-f2-run-0.2",
    checkpoint: 26,
    wave: "W1",
    run_id: `RUN-${fixture.test_id}-${fixture.seed}`,
    fixture: clone(fixture),
    content,
    initial_content: clone(content),
    initial_hash: await hashContent(content),
    events: [],
    history_refs: [],
    phase: "before",
    technical_status: "READY",
    network_requests: [],
    oracle_access: false
  };
}

async function appendEvent(run, {
  actor = "READER",
  eventType,
  inputPayload = {},
  beforeContent,
  visibleCriteria = {},
  reversible = true,
  undoRef = null,
  snapshotRef
}) {
  const sequence = run.events.length + 1;
  const event = {
    schema_version: EVENT_SCHEMA_VERSION,
    run_id: run.run_id,
    sequence,
    monotonic_ms: sequence * 100,
    test_id: run.fixture.test_id,
    cycle: run.fixture.cycle,
    actor,
    event_type: eventType,
    input_payload: clone(inputPayload),
    before_state_hash: await hashContent(beforeContent),
    after_state_hash: await hashContent(run.content),
    provenance: allProvenance(run.content),
    visible_criteria: clone(visibleCriteria),
    reversible,
    undo_ref: undoRef,
    policy_decision_ref: run.fixture.policy_decision_ref,
    ui_snapshot_ref: snapshotRef
  };
  run.events.push(event);
  run.history_refs.push(`${run.run_id}#${sequence}`);
  return event;
}

export async function executePrimary(run) {
  if (run.phase !== "before") throw new Error("La acción primaria sólo puede ejecutarse desde before.");
  const before = clone(run.content);
  const id = run.fixture.test_id;

  if (id === "C1-T01") {
    run.content.sort = {field: "value", direction: "ascending"};
    run.content.record_order = [...run.content.records].sort((a, b) => a.value - b.value || a.record_id.localeCompare(b.record_id)).map(({record_id}) => record_id);
    await appendEvent(run, {eventType: "SORT_APPLIED", inputPayload: {field: "value", direction: "ascending"}, beforeContent: before, visibleCriteria: {criterion: "Valor ascendente", undo_available: true}, undoRef: "snapshot:initial", snapshotRef: "screenshots/after.png"});
    run.technical_status = "SORT_ACTIVE";
  } else if (id === "C1-T03") {
    run.content.filter = {field: "group", operator: "equals", value: "A"};
    run.content.visible_record_ids = run.content.records.filter(({group}) => group === "A").map(({record_id}) => record_id);
    await appendEvent(run, {eventType: "FILTER_APPLIED", inputPayload: {group: "A"}, beforeContent: before, visibleCriteria: {filter_label: "Grupo A", visible_count: run.content.visible_record_ids.length}, undoRef: "snapshot:initial", snapshotRef: "screenshots/after.png"});
    run.technical_status = "FILTER_ACTIVE";
  } else if (id === "C1-T05") {
    run.content.representation_id = "dot_plot";
    await appendEvent(run, {eventType: "REPRESENTATION_CHANGED", inputPayload: {from: "table", to: "dot_plot"}, beforeContent: before, visibleCriteria: {active_view: "Gráfico de puntos", fields_preserved: true}, undoRef: "representation:table", snapshotRef: "screenshots/after.png"});
    run.technical_status = "DOT_PLOT_ACTIVE";
  } else if (id === "C1-T07") {
    run.content.grouping_id = "grouping_original";
    run.content.records = run.content.records.map((record) => ({...record, group: record.original_group}));
    await appendEvent(run, {eventType: "ORIGINAL_GROUPING_RESTORED", inputPayload: {grouping_id: "grouping_original"}, beforeContent: before, visibleCriteria: {grouping: "Original", trajectory_available: true}, undoRef: "history:grouping_modified", snapshotRef: "screenshots/after.png"});
    run.technical_status = "ORIGINAL_ACTIVE";
  } else if (id === "C2-T04") {
    run.content.active_view_id = "view_previous";
    run.content.navigation = {back: [], forward: ["view_current"]};
    await appendEvent(run, {eventType: "PREVIOUS_VIEW_RESTORED", inputPayload: {view_id: "view_previous"}, beforeContent: before, visibleCriteria: {active_view: "Vista anterior", redo_available: true}, undoRef: "forward:view_current", snapshotRef: "screenshots/after.png"});
    run.technical_status = "PREVIOUS_VIEW_ACTIVE";
  } else if (id === "C2-T10") {
    run.content.question_version_counter = 2;
    run.content.active_question_version = 2;
    run.content.question_versions.push({version: 2, question_id: "question_B", text: "¿Qué cambia al observar cada grupo por separado?"});
    await appendEvent(run, {eventType: "QUESTION_CHANGED", inputPayload: {from: "question_A", to: "question_B"}, beforeContent: before, visibleCriteria: {active_question: "question_B", previous_available: true}, undoRef: "question-version:1", snapshotRef: "screenshots/after.png"});
    run.technical_status = "QUESTION_B_ACTIVE";
  } else if (id === "C3-T08") {
    run.content.active_relation_version = 2;
    run.content.relation_versions.push({version: 2, relation_id: "relation_v2", text: "Los valores altos aparecen con distinta frecuencia según el grupo.", status: "PROVISIONAL"});
    await appendEvent(run, {eventType: "RELATION_REFORMULATED", inputPayload: {from: "relation_v1", to: "relation_v2"}, beforeContent: before, visibleCriteria: {active_relation: "relation_v2", provisional: true, previous_available: true}, undoRef: "relation-version:1", snapshotRef: "screenshots/after.png"});
    run.technical_status = "RELATION_V2_PROVISIONAL";
  } else if (id === "C3-T11") {
    run.content.hypothesis_status = "CLOSED_PROVISIONAL";
    run.content.closure_history.push({sequence: 1, action: "CLOSE_PROVISIONAL"});
    await appendEvent(run, {eventType: "HYPOTHESIS_ABANDONED", inputPayload: {hypothesis_id: run.content.hypothesis_id}, beforeContent: before, visibleCriteria: {status: "Cierre provisional", reopen_available: true}, undoRef: "hypothesis:reopen", snapshotRef: "screenshots/after.png"});
    run.technical_status = "CLOSED_PROVISIONAL";
  } else {
    throw new Error(`Caso W1 no implementado: ${id}`);
  }

  run.phase = "after";
  return run;
}

export async function executeRecovery(run) {
  if (run.phase !== "after") throw new Error("La recuperación sólo puede ejecutarse desde after.");
  const before = clone(run.content);
  const id = run.fixture.test_id;

  if (id === "C1-T01") {
    run.content = clone(run.initial_content);
    await appendEvent(run, {eventType: "UNDO_APPLIED", inputPayload: {action: "undo_sort"}, beforeContent: before, visibleCriteria: {restored_order: true}, undoRef: "snapshot:initial", snapshotRef: "screenshots/recovery.png"});
    run.technical_status = "INITIAL_ORDER_RESTORED";
  } else if (id === "C1-T03") {
    run.content.filter = null;
    run.content.visible_record_ids = run.content.records.map(({record_id}) => record_id);
    await appendEvent(run, {eventType: "FILTER_REVERTED", inputPayload: {action: "clear_filter"}, beforeContent: before, visibleCriteria: {filter_label: null, visible_count: run.content.visible_record_ids.length}, undoRef: "snapshot:initial", snapshotRef: "screenshots/recovery.png"});
    const snapshot = clone(run.content);
    await appendEvent(run, {actor: "SYSTEM", eventType: "SNAPSHOT_CAPTURED", inputPayload: {label: "recovery"}, beforeContent: snapshot, visibleCriteria: {restored_initial_hash: (await hashContent(run.content)) === run.initial_hash}, reversible: false, undoRef: "snapshot:initial", snapshotRef: "screenshots/recovery.png"});
    run.technical_status = "FILTER_REVERTED";
  } else if (id === "C1-T05") {
    run.content.representation_id = "table";
    await appendEvent(run, {eventType: "UNDO_APPLIED", inputPayload: {action: "restore_table"}, beforeContent: before, visibleCriteria: {active_view: "Tabla", fields_preserved: true}, undoRef: "representation:table", snapshotRef: "screenshots/recovery.png"});
    run.technical_status = "TABLE_RESTORED";
  } else if (id === "C1-T07") {
    run.content = clone(run.initial_content);
    await appendEvent(run, {eventType: "MODIFIED_GROUPING_REACTIVATED", inputPayload: {grouping_id: "grouping_modified"}, beforeContent: before, visibleCriteria: {grouping: "Modificada", trajectory_preserved: true}, undoRef: "history:grouping_original", snapshotRef: "screenshots/recovery.png"});
    run.technical_status = "MODIFIED_ACTIVE";
  } else if (id === "C2-T04") {
    run.content = clone(run.initial_content);
    await appendEvent(run, {eventType: "REDO_APPLIED", inputPayload: {view_id: "view_current"}, beforeContent: before, visibleCriteria: {active_view: "Vista actual", back_available: true}, undoRef: "back:view_previous", snapshotRef: "screenshots/recovery.png"});
    run.technical_status = "CURRENT_VIEW_RESTORED";
  } else if (id === "C2-T10") {
    run.content.active_question_version = 1;
    await appendEvent(run, {eventType: "QUESTION_VERSION_RESTORED", inputPayload: {version: 1}, beforeContent: before, visibleCriteria: {active_question: "question_A", version_2_preserved: true}, undoRef: "question-version:2", snapshotRef: "screenshots/recovery.png"});
    run.technical_status = "QUESTION_A_RESTORED";
  } else if (id === "C3-T08") {
    run.content.active_relation_version = 1;
    await appendEvent(run, {eventType: "RELATION_VERSION_ACTIVATED", inputPayload: {version: 1}, beforeContent: before, visibleCriteria: {active_relation: "relation_v1", version_2_preserved: true, provisional: true}, undoRef: "relation-version:2", snapshotRef: "screenshots/recovery.png"});
    run.technical_status = "RELATION_V1_ACTIVE";
  } else if (id === "C3-T11") {
    run.content.hypothesis_status = "OPEN_PROVISIONAL";
    run.content.closure_history.push({sequence: 2, action: "REOPEN_PROVISIONAL"});
    await appendEvent(run, {eventType: "HYPOTHESIS_REOPENED", inputPayload: {hypothesis_id: run.content.hypothesis_id}, beforeContent: before, visibleCriteria: {status: "Provisional activa", closure_preserved: true}, undoRef: "hypothesis:close", snapshotRef: "screenshots/recovery.png"});
    run.technical_status = "HYPOTHESIS_REOPENED";
  }

  run.phase = "recovery";
  return run;
}

export function exportState(run) {
  return {
    schema_version: "oe-irp-f2-state-0.2",
    checkpoint: 26,
    wave: "W1",
    run_id: run.run_id,
    test_id: run.fixture.test_id,
    phase: run.phase,
    content: clone(run.content),
    history_refs: [...run.history_refs],
    technical_status: run.technical_status
  };
}
