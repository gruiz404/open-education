const fixture = (testId, cycle, seed, scene, initialContent, primaryDecision = "ALLOW") => ({
  schema_version: "oe-irp-f2-fixture-0.3",
  test_id: testId,
  wave: "W2",
  cycle,
  seed,
  scene,
  primary_decision: primaryDecision,
  policy_decision_ref: `B2:${testId}:${primaryDecision}`,
  initial_content: initialContent
});

const equalViewTokens = {
  size_token: "equal-1",
  color_token: "neutral-blue-1",
  order_weight: "equal",
  recommendation: "NONE"
};

export const fixtureCatalog = {
  "C1-T06": fixture("C1-T06", 1, "OE001-F2-C1-T06-S01", "S04 · Selector de vistas equivalentes", {
    view_id: "view_A",
    reader_choice: null,
    cognition_claim: "NONE",
    views: [
      {view_id: "view_A", label: "Vista A", description: "Tabla por caso", tokens: equalViewTokens, provenance: ["fixture:OE001-F2", "view:view_A"]},
      {view_id: "view_B", label: "Vista B", description: "Barras por caso", tokens: equalViewTokens, provenance: ["fixture:OE001-F2", "view:view_B"]}
    ]
  }),
  "C1-T08": fixture("C1-T08", 1, "OE001-F2-C1-T08-S01", "S06 · Dos representaciones comparables", {
    comparison_open: false,
    observation: null,
    views_preserved: true,
    views: [
      {view_id: "view_A", label: "Vista A", description: "Valores organizados por caso", tokens: equalViewTokens, provenance: ["fixture:OE001-F2", "view:view_A"]},
      {view_id: "view_B", label: "Vista B", description: "Valores organizados por grupo", tokens: equalViewTokens, provenance: ["fixture:OE001-F2", "view:view_B"]}
    ]
  }),
  "C2-T02": fixture("C2-T02", 2, "OE001-F2-C2-T02-S01", "S08 · Configuración con default inyectado", {
    default_option: "view_B",
    reader_choice: null,
    interaction_enabled: false,
    salience_violation: "DETECTED",
    clean_snapshot: false,
    options: [
      {option_id: "view_A", label: "Opción A", description: "Comparar por caso", tokens: equalViewTokens, provenance: ["fixture:OE001-F2", "option:view_A"]},
      {option_id: "view_B", label: "Opción B", description: "Comparar por grupo", tokens: equalViewTokens, provenance: ["fixture:OE001-F2", "option:view_B"]}
    ]
  }, "BLOCK"),
  "C2-T05": fixture("C2-T05", 2, "OE001-F2-C2-T05-S01", "S10 · Opciones de agrupación neutrales", {
    grouping_id: "option_A",
    reader_choice: null,
    cognition_claim: "NONE",
    groupings: [
      {grouping_id: "option_A", label: "Agrupación A", description: "Separar por región", tokens: equalViewTokens, provenance: ["fixture:OE001-F2", "grouping:option_A"]},
      {grouping_id: "option_B", label: "Agrupación B", description: "Separar por intervalo", tokens: equalViewTokens, provenance: ["fixture:OE001-F2", "grouping:option_B"]}
    ]
  }),
  "C2-T06": fixture("C2-T06", 2, "OE001-F2-C2-T06-S01", "S11 · Vista agrupada con alternativa previa", {
    active_view_id: "view_grouped",
    previous_view_id: "view_individual",
    visibility_limit: null,
    return_option_exposed: false,
    snapshots: ["view_individual", "view_grouped"],
    views: [
      {view_id: "view_grouped", label: "Vista agrupada", description: "Síntesis por intervalo", tokens: equalViewTokens, provenance: ["fixture:OE001-F2", "view:view_grouped"]},
      {view_id: "view_individual", label: "Vista anterior", description: "Casos individuales", tokens: equalViewTokens, provenance: ["fixture:OE001-F2", "view:view_individual"]}
    ]
  }),
  "C3-T06": fixture("C3-T06", 3, "OE001-F2-C3-T06-S01", "S17 · Casos favorables y contradictorios", {
    comparison_open: false,
    supporting_ids: ["S1", "S2"],
    contradicting_ids: ["C1", "C2"],
    confirmation: "NONE",
    salience_audit: null,
    cases: [
      {case_id: "S1", kind: "supporting", label: "Favorable 1", value: "A y B aumentan", provenance: ["fixture:OE001-F2", "case:S1"]},
      {case_id: "S2", kind: "supporting", label: "Favorable 2", value: "A y B descienden", provenance: ["fixture:OE001-F2", "case:S2"]},
      {case_id: "C1", kind: "contradicting", label: "Contradictorio 1", value: "A aumenta y B no", provenance: ["fixture:OE001-F2", "case:C1"]},
      {case_id: "C2", kind: "contradicting", label: "Contradictorio 2", value: "B aumenta y A no", provenance: ["fixture:OE001-F2", "case:C2"]}
    ]
  })
};

export const wave2Ids = Object.keys(fixtureCatalog);

export function getFixture(testId) {
  const selected = fixtureCatalog[testId];
  if (!selected) throw new Error(`Fixture desconocido: ${testId}`);
  return structuredClone(selected);
}
