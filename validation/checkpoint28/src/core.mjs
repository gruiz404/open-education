const EVENT_SCHEMA_VERSION = "oe-irp-f2-event-0.4";

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
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (Array.isArray(value.provenance)) value.provenance.forEach((ref) => values.add(ref));
    Object.values(value).forEach(visit);
  };
  visit(content);
  return [...values].sort();
}

async function appendEvent(run, {actor = "READER", eventType, inputPayload = {}, beforeContent, visibleCriteria = {}, reversible = true, undoRef = null, snapshotRef}) {
  const sequence = run.events.length + 1;
  const event = {
    schema_version: EVENT_SCHEMA_VERSION, run_id: run.run_id, sequence, monotonic_ms: sequence * 100,
    test_id: run.fixture.test_id, cycle: run.fixture.cycle, actor, event_type: eventType,
    input_payload: clone(inputPayload), before_state_hash: await hashContent(beforeContent),
    after_state_hash: await hashContent(run.content), provenance: allProvenance(run.content),
    visible_criteria: clone(visibleCriteria), reversible, undo_ref: undoRef,
    policy_decision_ref: run.fixture.policy_decision_ref, ui_snapshot_ref: snapshotRef
  };
  run.events.push(event);
  run.history_refs.push(`${run.run_id}#${sequence}`);
  return event;
}

export async function createRun(fixture) {
  const content = clone(fixture.initial_content);
  return {
    schema_version: "oe-irp-f2-run-0.4", checkpoint: 28, wave: "W3",
    run_id: `RUN-${fixture.test_id}-${fixture.seed}`, fixture: clone(fixture), content,
    initial_content: clone(content), initial_hash: await hashContent(content), events: [], history_refs: [],
    phase: "before", technical_status: "READY_ALLOWLISTED_DISCLOSURE", network_requests: [], oracle_access: false
  };
}

function requestedField(testId) {
  if (testId === "C2-T01") return "grouping_change";
  if (testId === "C2-T11") return "dimension_D";
  if (testId === "C3-T03") return "dimension_C";
  throw new Error(`Caso W3 no implementado: ${testId}`);
}

export async function executePrimary(run) {
  if (run.phase !== "before") throw new Error("La acción primaria sólo puede ejecutarse desde before.");
  const id = run.fixture.test_id;
  const field = requestedField(id);
  let before = clone(run.content);
  run.content.requested_field = field;
  await appendEvent(run, {eventType: "FACT_REQUESTED", inputPayload: {field}, beforeContent: before, visibleCriteria: {requested_field: field, request_scope: "EXACT"}, undoRef: `disclosure:${field}:hide`, snapshotRef: "screenshots/after.png"});

  if (id !== "C2-T01") {
    before = clone(run.content);
    if (!run.content.allowlist.includes(field)) throw new Error(`Campo no autorizado: ${field}`);
    await appendEvent(run, {actor: "SYSTEM", eventType: "ALLOWLIST_CHECKED", inputPayload: {field, allowlist: clone(run.content.allowlist)}, beforeContent: before, visibleCriteria: {field, allowlisted: true, adjacent_fields_revealed: 0}, reversible: false, undoRef: `disclosure:${field}:hide`, snapshotRef: "screenshots/after.png"});
  }

  before = clone(run.content);
  run.content.disclosure_open = true;
  if (id === "C2-T01") {
    run.content.revealed_fields = ["grouping_key", "grouping_membership", "record_ids_preserved"];
    run.content.factual_disclosure_count += 1;
    run.content.disclosure_provenance = "fixture:OE001-F2:S07";
    run.content.disclosure_scope = "GROUPING_OPERATION_ONLY";
  } else {
    run.content.revealed_fields = [field];
    run.content.disclosure_provenance = `fixture:OE001-F2:${field}`;
    run.content.disclosure_scope = "EXACT_REQUEST_ONLY";
  }
  await appendEvent(run, {actor: "SYSTEM", eventType: "FACT_REVEALED", inputPayload: {revealed_fields: clone(run.content.revealed_fields)}, beforeContent: before, visibleCriteria: {revealed_fields: clone(run.content.revealed_fields), adjacent_fields_revealed: 0, interpretation: "NONE", recommendation: "NONE"}, undoRef: `disclosure:${field}:hide`, snapshotRef: "screenshots/after.png"});

  if (id === "C2-T01") {
    before = clone(run.content);
    await appendEvent(run, {actor: "SYSTEM", eventType: "PROVENANCE_RECORDED", inputPayload: {source: run.content.disclosure_provenance}, beforeContent: before, visibleCriteria: {provenance_visible: true, scope: run.content.disclosure_scope}, reversible: false, undoRef: `disclosure:${field}:hide`, snapshotRef: "screenshots/after.png"});
  }
  run.technical_status = "MINIMUM_FACT_REVEALED";
  run.phase = "after";
  return run;
}

export async function executeRecovery(run) {
  if (run.phase !== "after") throw new Error("La recuperación sólo puede ejecutarse desde after.");
  const before = clone(run.content);
  const field = requestedField(run.fixture.test_id);
  run.content.disclosure_open = false;
  run.content.requested_field = null;
  run.content.revealed_fields = [];
  run.content.disclosure_provenance = null;
  run.content.disclosure_scope = null;
  await appendEvent(run, {eventType: "DISCLOSURE_HIDDEN", inputPayload: {field}, beforeContent: before, visibleCriteria: {revealed_fields: [], history_preserved: true, hypothesis_status: run.content.hypothesis_status || null}, undoRef: `disclosure:${field}:show`, snapshotRef: "screenshots/recovery.png"});
  run.technical_status = "SCENE_RESTORED_HISTORY_PRESERVED";
  run.phase = "recovery";
  return run;
}

export function exportState(run) {
  return {schema_version: "oe-irp-f2-state-0.4", checkpoint: 28, wave: "W3", run_id: run.run_id, test_id: run.fixture.test_id, phase: run.phase, content: clone(run.content), history_refs: [...run.history_refs], technical_status: run.technical_status};
}
