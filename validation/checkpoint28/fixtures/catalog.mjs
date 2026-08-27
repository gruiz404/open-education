const fixture = (testId, cycle, seed, scene, initialContent) => ({
  schema_version: "oe-irp-f2-fixture-0.4",
  test_id: testId,
  wave: "W3",
  cycle,
  seed,
  scene,
  primary_decision: "ALLOW",
  policy_decision_ref: `B2:${testId}:ALLOW_MINIMUM`,
  initial_content: initialContent
});

const records = [
  {record_id: "R01", group: "Norte", value: 12},
  {record_id: "R02", group: "Norte", value: 18},
  {record_id: "R03", group: "Sur", value: 15},
  {record_id: "R04", group: "Sur", value: 21}
];

export const fixtureCatalog = {
  "C2-T01": fixture("C2-T01", 2, "OE001-F2-C2-T01-S01", "S07 · Vista agrupada con clave visible", {
    grouping_key: "región",
    grouping_membership: {Norte: ["R01", "R02"], Sur: ["R03", "R04"]},
    record_ids: records.map(({record_id}) => record_id),
    records,
    allowlist: ["grouping_key", "grouping_membership", "record_ids_preserved"],
    disclosure_open: false,
    revealed_fields: [],
    factual_disclosure_count: 0,
    interpretation: "NONE",
    recommendation: "NONE",
    relation_claim: "NONE"
  }),
  "C2-T11": fixture("C2-T11", 2, "OE001-F2-C2-T11-S01", "S14 · Dimensión factual oculta pero autorizable", {
    records,
    allowlist: ["dimension_D"],
    factual_values: {
      dimension_C: {label: "Origen del registro", value: "Fuente sintética A"},
      dimension_D: {label: "Fecha de observación", value: "2026-08-24"},
      dimension_E: {label: "Método de captura", value: "Registro manual"}
    },
    requested_field: null,
    revealed_fields: [],
    disclosure_open: false,
    disclosure_provenance: null,
    disclosure_scope: null,
    interpretation: "NONE",
    recommendation: "NONE"
  }),
  "C3-T03": fixture("C3-T03", 3, "OE001-F2-C3-T03-S01", "S15 · Relación provisional y contexto factual", {
    records,
    hypothesis: "Los grupos podrían diferir en la distribución observada.",
    hypothesis_status: "PROVISIONAL",
    allowlist: ["dimension_C"],
    factual_values: {
      dimension_B: {label: "Unidad auxiliar", value: "Índice sintético"},
      dimension_C: {label: "Unidad de medida", value: "puntos"},
      dimension_D: {label: "Periodo", value: "corte único"}
    },
    requested_field: null,
    revealed_fields: [],
    disclosure_open: false,
    disclosure_provenance: null,
    disclosure_scope: null,
    hypothesis_confirmation: "NONE",
    interpretation: "NONE",
    recommendation: "NONE"
  })
};

export const wave3Ids = Object.keys(fixtureCatalog);

export function getFixture(testId) {
  const selected = fixtureCatalog[testId];
  if (!selected) throw new Error(`Fixture desconocido: ${testId}`);
  return structuredClone(selected);
}
