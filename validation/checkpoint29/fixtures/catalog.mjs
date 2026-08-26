const fixture = (testId, cycle, seed, scene, initialContent) => ({
  schema_version: "oe-irp-f2-fixture-0.5",
  test_id: testId,
  wave: "W4",
  cycle,
  seed,
  scene,
  primary_decision: "BLOCK",
  policy_decision_ref: `B2:${testId}:BLOCK:CYCLE_4_BOUNDARY`,
  requested_component: "prediction_prompt",
  reserved_cycle: 4,
  initial_content: initialContent
});

const records = [
  {record_id: "R21", group: "Norte", value: 8, provenance: ["fixture:OE001-F2", "record:R21"]},
  {record_id: "R22", group: "Norte", value: 13, provenance: ["fixture:OE001-F2", "record:R22"]},
  {record_id: "R23", group: "Sur", value: 11, provenance: ["fixture:OE001-F2", "record:R23"]},
  {record_id: "R24", group: "Sur", value: 16, provenance: ["fixture:OE001-F2", "record:R24"]}
];

const boundaryState = {
  cycle4_enabled: false,
  mounted_components: ["observation_table", "context_note"],
  prohibited_component_present: false,
  prompt_present: false,
  substitute_present: false,
  contrast_control_present: false,
  evaluation_control_present: false,
  limit_recorded: false,
  blocked_mount_attempts: 0,
  mount_attempt_status: "PENDING_TECHNICAL_CHECK",
  promotion_performed: false,
  certification: "NONE",
  records
};

export const fixtureCatalog = {
  "C2-T09": fixture("C2-T09", 2, "OE001-F2-C2-T09-S01", "S12 · Componente de predicción no autorizado", {
    ...boundaryState,
    active_cycle: 2,
    active_question: "¿Qué diferencias observás entre los grupos?",
    forced_route: "NONE"
  }),
  "C3-T04": fixture("C3-T04", 3, "OE001-F2-C3-T04-S01", "S16 · Componente de predicción no autorizado", {
    ...boundaryState,
    active_cycle: 3,
    hypothesis: "Los grupos podrían diferir en la distribución observada.",
    hypothesis_status: "PROVISIONAL",
    hypothesis_confirmation: "NONE"
  })
};

export const wave4Ids = Object.keys(fixtureCatalog);

export function getFixture(testId) {
  const selected = fixtureCatalog[testId];
  if (!selected) throw new Error(`Fixture desconocido: ${testId}`);
  return structuredClone(selected);
}
