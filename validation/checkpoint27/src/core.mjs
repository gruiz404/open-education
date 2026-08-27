const EVENT_SCHEMA_VERSION = "oe-irp-f2-event-0.3";

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
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (Array.isArray(value.provenance)) value.provenance.forEach((ref) => values.add(ref));
    Object.values(value).forEach(visit);
  };
  visit(content);
  return [...values].sort();
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

export async function createRun(fixture) {
  const content = clone(fixture.initial_content);
  const run = {
    schema_version: "oe-irp-f2-run-0.3",
    checkpoint: 27,
    wave: "W2",
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

  if (fixture.test_id === "C2-T02") {
    const before = clone(run.content);
    await appendEvent(run, {
      actor: "SYSTEM",
      eventType: "SALIENCE_VIOLATION_DETECTED",
      inputPayload: {default_option: run.content.default_option},
      beforeContent: before,
      visibleCriteria: {default_visible: true, options_equivalent: false},
      reversible: false,
      snapshotRef: "screenshots/before.png"
    });
    await appendEvent(run, {
      actor: "SYSTEM",
      eventType: "INTERACTION_BLOCKED",
      inputPayload: {reason: "UNEQUAL_SALIENCE"},
      beforeContent: before,
      visibleCriteria: {interaction_enabled: false, reader_choice: null},
      reversible: false,
      snapshotRef: "screenshots/before.png"
    });
    run.technical_status = "BLOCKED_UNEQUAL_SALIENCE";
  }
  return run;
}

export async function executePrimary(run) {
  if (run.phase !== "before") throw new Error("La acción primaria sólo puede ejecutarse desde before.");
  const id = run.fixture.test_id;

  if (id === "C1-T06") {
    let before = clone(run.content);
    run.content.view_id = "view_B";
    run.content.reader_choice = "view_B";
    await appendEvent(run, {eventType: "VIEW_SELECTED", inputPayload: {view_id: "view_B"}, beforeContent: before, visibleCriteria: {selected_view: "view_B", options_equivalent: true}, undoRef: "view:view_A", snapshotRef: "screenshots/after.png"});
    before = clone(run.content);
    await appendEvent(run, {actor: "SYSTEM", eventType: "ACTION_RECORDED", inputPayload: {action: "select_view"}, beforeContent: before, visibleCriteria: {cognition_claim: "NONE"}, undoRef: "view:view_A", snapshotRef: "screenshots/after.png"});
    before = clone(run.content);
    await appendEvent(run, {actor: "SYSTEM", eventType: "UNDO_AVAILABLE", inputPayload: {target: "view_A"}, beforeContent: before, visibleCriteria: {undo_available: true}, undoRef: "view:view_A", snapshotRef: "screenshots/after.png"});
    run.technical_status = "VIEW_B_SELECTED_NEUTRAL";
  } else if (id === "C1-T08") {
    let before = clone(run.content);
    run.content.comparison_open = true;
    await appendEvent(run, {eventType: "VIEW_COMPARISON_OPENED", inputPayload: {views: ["view_A", "view_B"]}, beforeContent: before, visibleCriteria: {simultaneous: true, options_equivalent: true}, undoRef: "comparison:close", snapshotRef: "screenshots/after.png"});
    before = clone(run.content);
    run.content.observation = {text: "La organización de los mismos valores cambia entre las dos vistas.", provenance: "READER"};
    await appendEvent(run, {eventType: "READER_OBSERVATION_RECORDED", inputPayload: {text: run.content.observation.text}, beforeContent: before, visibleCriteria: {provenance: "READER", views_preserved: true}, undoRef: "comparison:close", snapshotRef: "screenshots/after.png"});
    run.technical_status = "COMPARISON_OPEN_READER_OBSERVATION";
  } else if (id === "C2-T02") {
    const before = clone(run.content);
    run.content.default_option = null;
    run.content.interaction_enabled = true;
    run.content.salience_violation = "NEUTRALIZED";
    await appendEvent(run, {actor: "SYSTEM", eventType: "OPTIONS_NEUTRALIZED", inputPayload: {removed_default: "view_B"}, beforeContent: before, visibleCriteria: {options_equivalent: true, reader_choice: null, interaction_enabled: true}, reversible: false, snapshotRef: "screenshots/after.png"});
    run.technical_status = "NEUTRAL_OPTIONS_ENABLED";
  } else if (id === "C2-T05") {
    let before = clone(run.content);
    run.content.grouping_id = "option_B";
    run.content.reader_choice = "option_B";
    await appendEvent(run, {eventType: "GROUP_SELECTED", inputPayload: {grouping_id: "option_B"}, beforeContent: before, visibleCriteria: {criterion_visible: true, options_equivalent: true}, undoRef: "grouping:option_A", snapshotRef: "screenshots/after.png"});
    before = clone(run.content);
    await appendEvent(run, {actor: "SYSTEM", eventType: "ACTION_RECORDED", inputPayload: {action: "select_grouping"}, beforeContent: before, visibleCriteria: {cognition_claim: "NONE"}, undoRef: "grouping:option_A", snapshotRef: "screenshots/after.png"});
    before = clone(run.content);
    await appendEvent(run, {actor: "SYSTEM", eventType: "UNDO_AVAILABLE", inputPayload: {target: "option_A"}, beforeContent: before, visibleCriteria: {undo_available: true}, undoRef: "grouping:option_A", snapshotRef: "screenshots/after.png"});
    run.technical_status = "GROUPING_B_SELECTED_NEUTRAL";
  } else if (id === "C2-T06") {
    let before = clone(run.content);
    run.content.visibility_limit = {text: "Los casos individuales quedaron menos visibles.", provenance: "READER"};
    await appendEvent(run, {eventType: "VISIBILITY_LIMIT_RECORDED", inputPayload: {text: run.content.visibility_limit.text}, beforeContent: before, visibleCriteria: {provenance: "READER", active_view: "view_grouped"}, undoRef: "view:view_individual", snapshotRef: "screenshots/after.png"});
    before = clone(run.content);
    run.content.return_option_exposed = true;
    await appendEvent(run, {actor: "SYSTEM", eventType: "RETURN_OPTION_EXPOSED", inputPayload: {target: "view_individual"}, beforeContent: before, visibleCriteria: {neutral_return: true, previous_snapshot_preserved: true}, undoRef: "view:view_individual", snapshotRef: "screenshots/after.png"});
    run.technical_status = "LIMIT_RECORDED_RETURN_AVAILABLE";
  } else if (id === "C3-T06") {
    let before = clone(run.content);
    run.content.comparison_open = true;
    await appendEvent(run, {eventType: "BALANCED_CASES_REQUESTED", inputPayload: {supporting: 2, contradicting: 2}, beforeContent: before, visibleCriteria: {equal_counts: true}, undoRef: "comparison:close", snapshotRef: "screenshots/after.png"});
    before = clone(run.content);
    await appendEvent(run, {actor: "SYSTEM", eventType: "CASES_JUXTAPOSED", inputPayload: {layout: "balanced_columns"}, beforeContent: before, visibleCriteria: {same_size: true, same_order_weight: true}, undoRef: "comparison:close", snapshotRef: "screenshots/after.png"});
    before = clone(run.content);
    run.content.salience_audit = "PASS";
    await appendEvent(run, {actor: "SYSTEM", eventType: "SALIENCE_AUDITED", inputPayload: {audit: "equal_weight"}, beforeContent: before, visibleCriteria: {supporting_weight: "equal", contradicting_weight: "equal", confirmation: "NONE"}, reversible: false, undoRef: "comparison:close", snapshotRef: "screenshots/after.png"});
    run.technical_status = "BALANCED_COMPARISON_OPEN";
  } else {
    throw new Error(`Caso W2 no implementado: ${id}`);
  }

  run.phase = "after";
  return run;
}

export async function executeRecovery(run) {
  if (run.phase !== "after") throw new Error("La recuperación sólo puede ejecutarse desde after.");
  const before = clone(run.content);
  const id = run.fixture.test_id;

  if (id === "C1-T06") {
    run.content = clone(run.initial_content);
    await appendEvent(run, {eventType: "UNDO_APPLIED", inputPayload: {target: "view_A"}, beforeContent: before, visibleCriteria: {view_id: "view_A", cognition_claim: "NONE"}, undoRef: "view:view_B", snapshotRef: "screenshots/recovery.png"});
    run.technical_status = "VIEW_A_RESTORED";
  } else if (id === "C1-T08") {
    run.content.comparison_open = false;
    await appendEvent(run, {eventType: "COMPARISON_CLOSED", inputPayload: {preserve: ["views", "observation"]}, beforeContent: before, visibleCriteria: {views_preserved: true, observation_preserved: true}, undoRef: "comparison:open", snapshotRef: "screenshots/recovery.png"});
    run.technical_status = "COMPARISON_CLOSED_PRESERVED";
  } else if (id === "C2-T02") {
    run.content.clean_snapshot = true;
    await appendEvent(run, {actor: "SYSTEM", eventType: "CLEAN_SCENE_REMOUNTED", inputPayload: {default_option: null}, beforeContent: before, visibleCriteria: {options_equivalent: true, reader_choice: null, interaction_enabled: true}, reversible: false, snapshotRef: "screenshots/recovery.png"});
    run.technical_status = "CLEAN_NEUTRAL_SCENE";
  } else if (id === "C2-T05") {
    run.content = clone(run.initial_content);
    await appendEvent(run, {eventType: "UNDO_APPLIED", inputPayload: {target: "option_A"}, beforeContent: before, visibleCriteria: {grouping_id: "option_A", cognition_claim: "NONE"}, undoRef: "grouping:option_B", snapshotRef: "screenshots/recovery.png"});
    run.technical_status = "GROUPING_A_RESTORED";
  } else if (id === "C2-T06") {
    run.content.active_view_id = "view_individual";
    await appendEvent(run, {eventType: "PREVIOUS_VIEW_RETURNED", inputPayload: {view_id: "view_individual"}, beforeContent: before, visibleCriteria: {visibility_limit_preserved: true, snapshots_preserved: true}, undoRef: "view:view_grouped", snapshotRef: "screenshots/recovery.png"});
    run.technical_status = "PREVIOUS_VIEW_RESTORED_LIMIT_PRESERVED";
  } else if (id === "C3-T06") {
    run.content.comparison_open = false;
    await appendEvent(run, {eventType: "COMPARISON_CLOSED", inputPayload: {preserve: ["supporting_ids", "contradicting_ids"]}, beforeContent: before, visibleCriteria: {both_sets_available: true, confirmation: "NONE"}, undoRef: "comparison:open", snapshotRef: "screenshots/recovery.png"});
    run.technical_status = "BALANCED_SETS_PRESERVED";
  }

  run.phase = "recovery";
  return run;
}

export function exportState(run) {
  return {
    schema_version: "oe-irp-f2-state-0.3",
    checkpoint: 27,
    wave: "W2",
    run_id: run.run_id,
    test_id: run.fixture.test_id,
    phase: run.phase,
    content: clone(run.content),
    history_refs: [...run.history_refs],
    technical_status: run.technical_status
  };
}
