const EVENT_SCHEMA_VERSION = "oe-irp-f2-event-0.5";

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

async function appendEvent(run, {actor, eventType, inputPayload = {}, beforeContent, visibleCriteria = {}, snapshotRef}) {
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
    reversible: false,
    undo_ref: null,
    policy_decision_ref: run.fixture.policy_decision_ref,
    ui_snapshot_ref: snapshotRef
  };
  run.events.push(event);
  run.history_refs.push(`${run.run_id}#${sequence}`);
  return event;
}

export async function createRun(fixture) {
  const content = clone(fixture.initial_content);
  return {
    schema_version: "oe-irp-f2-run-0.5",
    checkpoint: 29,
    wave: "W4",
    run_id: `RUN-${fixture.test_id}-${fixture.seed}`,
    fixture: clone(fixture),
    content,
    initial_content: clone(content),
    initial_hash: await hashContent(content),
    events: [],
    history_refs: [],
    phase: "before",
    technical_status: "READY_CYCLE4_BOUNDARY_CHECK",
    network_requests: [],
    oracle_access: false
  };
}

export async function executePrimary(run) {
  if (run.phase !== "before") throw new Error("La comprobación primaria sólo puede ejecutarse desde before.");
  const requested = run.fixture.requested_component;
  let before = clone(run.content);
  await appendEvent(run, {
    actor: "POLICY",
    eventType: "UNAUTHORIZED_COMPONENT_DETECTED",
    inputPayload: {requested_component: requested, reserved_cycle: run.fixture.reserved_cycle},
    beforeContent: before,
    visibleCriteria: {experience_component_present: false, active_cycle: run.content.active_cycle},
    snapshotRef: "screenshots/after.png"
  });

  before = clone(run.content);
  run.content.mounted_components = run.content.mounted_components.filter((component) => component !== requested);
  run.content.prohibited_component_present = false;
  run.content.prompt_present = false;
  run.content.substitute_present = false;
  run.content.contrast_control_present = false;
  run.content.evaluation_control_present = false;
  run.content.blocked_mount_attempts += 1;
  run.content.mount_attempt_status = "BLOCKED";
  await appendEvent(run, {
    actor: "SYSTEM",
    eventType: "COMPONENT_MOUNT_BLOCKED",
    inputPayload: {component: requested},
    beforeContent: before,
    visibleCriteria: {
      prompt_present: false,
      substitute_present: false,
      contrast_control_present: false,
      evaluation_control_present: false
    },
    snapshotRef: "screenshots/after.png"
  });

  before = clone(run.content);
  run.content.limit_recorded = true;
  await appendEvent(run, {
    actor: "SYSTEM",
    eventType: "LIMIT_RECORDED",
    inputPayload: {boundary: "CYCLE_4_DISABLED", active_cycle: run.content.active_cycle},
    beforeContent: before,
    visibleCriteria: {
      experience_available: true,
      promotion_performed: false,
      active_cycle: run.content.active_cycle
    },
    snapshotRef: "screenshots/after.png"
  });
  run.technical_status = "CYCLE4_COMPONENT_BLOCKED";
  run.phase = "after";
  return run;
}

export async function executeRecovery(run) {
  if (run.phase !== "after") throw new Error("La continuidad sólo puede ejecutarse desde after.");
  run.content.cycle4_enabled = false;
  run.content.mounted_components = run.content.mounted_components.filter((component) => component !== run.fixture.requested_component);
  run.content.prohibited_component_present = false;
  run.content.prompt_present = false;
  run.content.substitute_present = false;
  run.content.contrast_control_present = false;
  run.content.evaluation_control_present = false;
  run.content.promotion_performed = false;
  run.technical_status = run.fixture.test_id === "C2-T09"
    ? "C2_AVAILABLE_WITHOUT_FORCED_ROUTE"
    : "C3_AVAILABLE_WITHOUT_PROMOTION";
  run.phase = "recovery";
  return run;
}

export function exportState(run) {
  return {
    schema_version: "oe-irp-f2-state-0.5",
    checkpoint: 29,
    wave: "W4",
    run_id: run.run_id,
    test_id: run.fixture.test_id,
    phase: run.phase,
    content: clone(run.content),
    history_refs: [...run.history_refs],
    technical_status: run.technical_status
  };
}
