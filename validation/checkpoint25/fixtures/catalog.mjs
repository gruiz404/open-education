export const fixtureCatalog = {
  "C1-T03": {
    schema_version: "oe-irp-f2-fixture-0.1",
    test_id: "C1-T03",
    cycle: 1,
    seed: "OE001-F2-C1-T03-S01",
    scene: "S02 · Conjunto completo con filtro disponible",
    primary_decision: "ALLOW",
    policy_decision_ref: "B2:C1-T03:ALLOW",
    initial_content: {
      filter: null,
      visible_record_ids: ["R01", "R02", "R03", "R04", "R05", "R06"],
      records: [
        {record_id: "R01", label: "Caso 1", group: "A", value: 12, provenance: ["fixture:OE001-F2", "record:R01"]},
        {record_id: "R02", label: "Caso 2", group: "B", value: 18, provenance: ["fixture:OE001-F2", "record:R02"]},
        {record_id: "R03", label: "Caso 3", group: "A", value: 9, provenance: ["fixture:OE001-F2", "record:R03"]},
        {record_id: "R04", label: "Caso 4", group: "B", value: 15, provenance: ["fixture:OE001-F2", "record:R04"]},
        {record_id: "R05", label: "Caso 5", group: "A", value: 21, provenance: ["fixture:OE001-F2", "record:R05"]},
        {record_id: "R06", label: "Caso 6", group: "B", value: 11, provenance: ["fixture:OE001-F2", "record:R06"]}
      ]
    }
  },
  "C2-T02": {
    schema_version: "oe-irp-f2-fixture-0.1",
    test_id: "C2-T02",
    cycle: 2,
    seed: "OE001-F2-C2-T02-S01",
    scene: "S08 · Configuración con default inyectado",
    primary_decision: "BLOCK",
    policy_decision_ref: "B2:C2-T02:BLOCK",
    initial_content: {
      default_option: "view_B",
      reader_choice: null,
      interaction_enabled: false,
      salience_violation: true,
      options: [
        {option_id: "view_A", label: "Vista A", salience_token: "neutral"},
        {option_id: "view_B", label: "Vista B", salience_token: "highlighted"}
      ]
    }
  },
  "C3-T04": {
    schema_version: "oe-irp-f2-fixture-0.1",
    test_id: "C3-T04",
    cycle: 3,
    seed: "OE001-F2-C3-T04-S01",
    scene: "S16 · Componente de predicción no autorizado",
    primary_decision: "BLOCK",
    policy_decision_ref: "B2:C3-T04:BLOCK:C4",
    requested_component: "prediction_prompt",
    initial_content: {
      cycle4_enabled: false,
      hypothesis_status: "UNEVALUATED",
      mounted_components: ["observation_table", "context_note"],
      limit_recorded: false,
      records: [
        {record_id: "R21", label: "Observación alfa", group: "N", value: 8, provenance: ["fixture:OE001-F2", "record:R21"]},
        {record_id: "R22", label: "Observación beta", group: "N", value: 13, provenance: ["fixture:OE001-F2", "record:R22"]},
        {record_id: "R23", label: "Observación gamma", group: "N", value: 11, provenance: ["fixture:OE001-F2", "record:R23"]}
      ]
    }
  }
};

export function getFixture(testId) {
  const fixture = fixtureCatalog[testId];
  if (!fixture) throw new Error(`Fixture desconocido: ${testId}`);
  return structuredClone(fixture);
}
