const records = [
  {record_id: "R01", label: "Caso 1", group: "A", value: 18, provenance: ["fixture:OE001-F2", "record:R01"]},
  {record_id: "R02", label: "Caso 2", group: "B", value: 9, provenance: ["fixture:OE001-F2", "record:R02"]},
  {record_id: "R03", label: "Caso 3", group: "A", value: 21, provenance: ["fixture:OE001-F2", "record:R03"]},
  {record_id: "R04", label: "Caso 4", group: "B", value: 11, provenance: ["fixture:OE001-F2", "record:R04"]},
  {record_id: "R05", label: "Caso 5", group: "A", value: 15, provenance: ["fixture:OE001-F2", "record:R05"]}
];

const fixture = (testId, cycle, seed, scene, initialContent) => ({
  schema_version: "oe-irp-f2-fixture-0.2",
  test_id: testId,
  wave: "W1",
  cycle,
  seed,
  scene,
  primary_decision: "ALLOW",
  policy_decision_ref: `B2:${testId}:ALLOW`,
  initial_content: initialContent
});

export const fixtureCatalog = {
  "C1-T01": fixture("C1-T01", 1, "OE001-F2-C1-T01-S01", "S01 · Tabla base sin ordenar", {
    sort: null,
    record_order: records.map(({record_id}) => record_id),
    records
  }),
  "C1-T03": fixture("C1-T03", 1, "OE001-F2-C1-T03-S02", "S02 · Conjunto completo con filtro disponible", {
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
  }),
  "C1-T05": fixture("C1-T05", 1, "OE001-F2-C1-T05-S03", "S03 · Tabla con representación alternativa disponible", {
    dataset_hash: "aa6ea99c19715858890f5041427f682b6b05317a9d5d87c0e0d52d7f941f36d5",
    representation_id: "table",
    records: records.slice(0, 4)
  }),
  "C1-T07": fixture("C1-T07", 1, "OE001-F2-C1-T07-S05", "S05 · Agrupación modificada con trayectoria disponible", {
    grouping_id: "grouping_modified",
    grouping_history: ["grouping_original", "grouping_modified"],
    records: [
      {record_id: "R11", label: "Norte 1", group: "Alta", original_group: "Norte", modified_group: "Alta", value: 16, provenance: ["fixture:OE001-F2", "record:R11"]},
      {record_id: "R12", label: "Norte 2", group: "Baja", original_group: "Norte", modified_group: "Baja", value: 7, provenance: ["fixture:OE001-F2", "record:R12"]},
      {record_id: "R13", label: "Sur 1", group: "Alta", original_group: "Sur", modified_group: "Alta", value: 19, provenance: ["fixture:OE001-F2", "record:R13"]},
      {record_id: "R14", label: "Sur 2", group: "Baja", original_group: "Sur", modified_group: "Baja", value: 10, provenance: ["fixture:OE001-F2", "record:R14"]}
    ]
  }),
  "C2-T04": fixture("C2-T04", 2, "OE001-F2-C2-T04-S09", "S09 · Vista actual con recorrido anterior", {
    active_view_id: "view_current",
    view_history: ["view_previous", "view_current"],
    navigation: {back: ["view_previous"], forward: []},
    views: [
      {view_id: "view_previous", label: "Vista anterior", focus: "Comparación por grupo"},
      {view_id: "view_current", label: "Vista actual", focus: "Distribución por valor"}
    ]
  }),
  "C2-T10": fixture("C2-T10", 2, "OE001-F2-C2-T10-S13", "S13 · Pregunta activa con vistas exploradas", {
    cycle: 2,
    active_question_version: 1,
    question_version_counter: 1,
    question_versions: [
      {version: 1, question_id: "question_A", text: "¿Cómo varían los valores entre grupos?"}
    ]
  }),
  "C3-T08": fixture("C3-T08", 3, "OE001-F2-C3-T08-S18", "S18 · Relación provisional con versión inicial", {
    active_relation_version: 1,
    relation_versions: [
      {version: 1, relation_id: "relation_v1", text: "Los valores altos aparecen en ambos grupos.", status: "PROVISIONAL"}
    ],
    certification: "NONE"
  }),
  "C3-T11": fixture("C3-T11", 3, "OE001-F2-C3-T11-S19", "S19 · Hipótesis provisional activa", {
    hypothesis_id: "hypothesis_H1",
    hypothesis_text: "El grupo A concentra los valores más altos.",
    hypothesis_status: "OPEN_PROVISIONAL",
    closure_history: []
  })
};

export const wave1Ids = Object.keys(fixtureCatalog);

export function getFixture(testId) {
  const selected = fixtureCatalog[testId];
  if (!selected) throw new Error(`Fixture desconocido: ${testId}`);
  return structuredClone(selected);
}
