const EVENT_SCHEMA_VERSION = "oe-irp-f2-event-0.1";

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

function clone(value) {
  return structuredClone(value);
}

function allProvenance(content) {
  const values = new Set(["fixture:OE001-F2"]);
  for (const record of content.records || []) {
    for (const ref of record.provenance || []) values.add(ref);
  }
  return [...values].sort();
}

export async function createRun(fixture) {
  const content = clone(fixture.initial_content);
  const initialHash = await hashContent(content);
  return {
    schema_version: "oe-irp-f2-run-0.1",
    run_id: `RUN-${fixture.test_id}-${fixture.seed}`,
    fixture: clone(fixture),
    content,
    initial_content: clone(content),
    initial_hash: initialHash,
    events: [],
    history_refs: [],
    phase: "before",
    technical_status: "READY",
    network_requests: [],
    oracle_access: false
  };
}

async function appendEvent(run, {
  actor,
  eventType,
  inputPayload = {},
  beforeContent,
  afterContent,
  visibleCriteria = {},
  reversible = false,
  undoRef = null,
  snapshotRef
}) {
  const sequence = run.events.length + 1;
  const beforeHash = await hashContent(beforeContent);
  const afterHash = await hashContent(afterContent);
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
    before_state_hash: beforeHash,
    after_state_hash: afterHash,
    provenance: allProvenance(afterContent),
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
  const testId = run.fixture.test_id;

  if (testId === "C1-T03") {
    const before = clone(run.content);
    run.content.filter = {field: "group", operator: "equals", value: "A"};
    run.content.visible_record_ids = run.content.records.filter((record) => record.group === "A").map((record) => record.record_id);
    await appendEvent(run, {
      actor: "READER",
      eventType: "FILTER_APPLIED",
      inputPayload: {group: "A"},
      beforeContent: before,
      afterContent: run.content,
      visibleCriteria: {filter_label: "Grupo A", visible_count: run.content.visible_record_ids.length},
      reversible: true,
      undoRef: "snapshot:initial",
      snapshotRef: "screenshots/after.png"
    });
    run.technical_status = "FILTER_ACTIVE";
  } else if (testId === "C2-T02") {
    const beforeDetection = clone(run.content);
    await appendEvent(run, {
      actor: "POLICY",
      eventType: "SALIENCE_VIOLATION_DETECTED",
      inputPayload: {default_option: run.content.default_option},
      beforeContent: beforeDetection,
      afterContent: run.content,
      visibleCriteria: {options_equivalent: false, interaction_enabled: false},
      reversible: true,
      undoRef: "remount:neutral",
      snapshotRef: "screenshots/after.png"
    });
    const beforeBlock = clone(run.content);
    run.content.interaction_enabled = false;
    run.content.reader_choice = null;
    await appendEvent(run, {
      actor: "SYSTEM",
      eventType: "INTERACTION_BLOCKED",
      inputPayload: {reason: "default_salience"},
      beforeContent: beforeBlock,
      afterContent: run.content,
      visibleCriteria: {reader_choice: "NONE", interaction_enabled: false},
      reversible: true,
      undoRef: "remount:neutral",
      snapshotRef: "screenshots/after.png"
    });
    run.technical_status = "BLOCKED_FOR_NEUTRALITY";
  } else if (testId === "C3-T04") {
    const beforeDetect = clone(run.content);
    await appendEvent(run, {
      actor: "POLICY",
      eventType: "UNAUTHORIZED_COMPONENT_DETECTED",
      inputPayload: {requested_component: run.fixture.requested_component, reserved_cycle: 4},
      beforeContent: beforeDetect,
      afterContent: run.content,
      visibleCriteria: {experience_component_present: false},
      reversible: false,
      undoRef: null,
      snapshotRef: "screenshots/after.png"
    });
    const beforeBlock = clone(run.content);
    run.content.mounted_components = run.content.mounted_components.filter((component) => component !== "prediction_prompt");
    await appendEvent(run, {
      actor: "SYSTEM",
      eventType: "COMPONENT_MOUNT_BLOCKED",
      inputPayload: {component: run.fixture.requested_component},
      beforeContent: beforeBlock,
      afterContent: run.content,
      visibleCriteria: {prompt_present: false, substitute_present: false, contrast_control_present: false},
      reversible: false,
      undoRef: null,
      snapshotRef: "screenshots/after.png"
    });
    const beforeLimit = clone(run.content);
    run.content.limit_recorded = true;
    await appendEvent(run, {
      actor: "SYSTEM",
      eventType: "LIMIT_RECORDED",
      inputPayload: {boundary: "CYCLE_4_DISABLED"},
      beforeContent: beforeLimit,
      afterContent: run.content,
      visibleCriteria: {experience_available: true, promotion_performed: false},
      reversible: false,
      undoRef: null,
      snapshotRef: "screenshots/after.png"
    });
    run.technical_status = "CYCLE_4_BOUNDARY_ENFORCED";
  } else {
    throw new Error(`Piloto no implementado: ${testId}`);
  }

  run.phase = "after";
  return run;
}

export async function executeRecovery(run) {
  if (run.phase !== "after") throw new Error("La recuperación sólo puede ejecutarse desde after.");
  const testId = run.fixture.test_id;

  if (testId === "C1-T03") {
    const before = clone(run.content);
    run.content.filter = null;
    run.content.visible_record_ids = run.content.records.map((record) => record.record_id);
    await appendEvent(run, {
      actor: "READER",
      eventType: "FILTER_REVERTED",
      inputPayload: {action: "clear_filter"},
      beforeContent: before,
      afterContent: run.content,
      visibleCriteria: {filter_label: null, visible_count: run.content.visible_record_ids.length},
      reversible: true,
      undoRef: "snapshot:initial",
      snapshotRef: "screenshots/recovery.png"
    });
    const snapshotContent = clone(run.content);
    await appendEvent(run, {
      actor: "SYSTEM",
      eventType: "SNAPSHOT_CAPTURED",
      inputPayload: {label: "recovery"},
      beforeContent: snapshotContent,
      afterContent: run.content,
      visibleCriteria: {restored_initial_hash: (await hashContent(run.content)) === run.initial_hash},
      reversible: false,
      undoRef: "snapshot:initial",
      snapshotRef: "screenshots/recovery.png"
    });
    run.technical_status = "RESTORED";
  } else if (testId === "C2-T02") {
    const before = clone(run.content);
    run.content.default_option = null;
    run.content.reader_choice = null;
    run.content.interaction_enabled = true;
    run.content.salience_violation = false;
    run.content.options = run.content.options.map((option) => ({...option, salience_token: "neutral"}));
    await appendEvent(run, {
      actor: "SYSTEM",
      eventType: "OPTIONS_NEUTRALIZED",
      inputPayload: {remount: "neutral"},
      beforeContent: before,
      afterContent: run.content,
      visibleCriteria: {options_equivalent: true, selected_option: null, interaction_enabled: true},
      reversible: false,
      undoRef: "remount:neutral",
      snapshotRef: "screenshots/recovery.png"
    });
    run.technical_status = "NEUTRALIZED";
  } else if (testId === "C3-T04") {
    run.content.cycle4_enabled = false;
    run.content.hypothesis_status = "UNEVALUATED";
    run.content.mounted_components = run.content.mounted_components.filter((component) => component !== "prediction_prompt");
    run.technical_status = "C3_AVAILABLE_WITHOUT_PROMOTION";
  }

  run.phase = "recovery";
  return run;
}

export function exportState(run) {
  return {
    schema_version: "oe-irp-f2-state-0.1",
    run_id: run.run_id,
    test_id: run.fixture.test_id,
    phase: run.phase,
    content: clone(run.content),
    history_refs: [...run.history_refs],
    technical_status: run.technical_status
  };
}
