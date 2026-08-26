const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const headings = {"C2-T01": "Explicar qué cambió al agrupar", "C2-T11": "Revelar únicamente el contexto solicitado", "C3-T03": "Aportar contexto sin completar la hipótesis"};
const primaryLabels = {"C2-T01": "Solicitar explicación factual", "C2-T11": "Solicitar dimensión D", "C3-T03": "Solicitar dimensión C"};
const recoveryLabels = {"C2-T01": "Cerrar explicación", "C2-T11": "Ocultar contexto", "C3-T03": "Ocultar contexto"};

function recordsTable(records) {
  return `<table aria-label="Datos sintéticos preservados"><thead><tr><th>ID</th><th>Grupo</th><th>Valor</th></tr></thead><tbody>${records.map((row) => `<tr><td>${escapeHtml(row.record_id)}</td><td>${escapeHtml(row.group)}</td><td>${escapeHtml(row.value)}</td></tr>`).join("")}</tbody></table>`;
}
function provenanceLine(content) {
  return content.disclosure_open ? `<p class="provenance-line" data-provenance><strong>Procedencia:</strong> ${escapeHtml(content.disclosure_provenance)} · <strong>Alcance:</strong> ${escapeHtml(content.disclosure_scope)}</p>` : "";
}
function disclosureCard(label, value, field) {
  return `<article class="fact-card" data-revealed-field="${escapeHtml(field)}"><p class="eyebrow">Hecho solicitado</p><h3>${escapeHtml(label)}</h3><p class="fact-value">${escapeHtml(value)}</p></article>`;
}
function sceneBody(run) {
  const id = run.fixture.test_id;
  const content = run.content;
  if (id === "C2-T01") {
    const explanation = content.disclosure_open ? `<div class="fact-grid" data-disclosure><article class="fact-card" data-revealed-field="grouping_key"><p class="eyebrow">Clave</p><h3>${escapeHtml(content.grouping_key)}</h3></article><article class="fact-card" data-revealed-field="grouping_membership"><p class="eyebrow">Pertenencia</p><h3>Norte: R01, R02 · Sur: R03, R04</h3></article><article class="fact-card" data-revealed-field="record_ids_preserved"><p class="eyebrow">Elementos</p><h3>R01–R04 preservados</h3></article></div>` : "";
    return `${recordsTable(content.records)}<div class="state-line"><span>Vista</span><strong>Agrupada por región</strong><span class="count">Registros: ${content.records.length}</span></div>${explanation}${provenanceLine(content)}<p class="context-note">La explicación describe la operación; no interpreta por qué el agrupamiento importa.</p>`;
  }
  const field = id === "C2-T11" ? "dimension_D" : "dimension_C";
  const fact = content.factual_values[field];
  const revealed = content.disclosure_open ? `${disclosureCard(fact.label, fact.value, field)}${provenanceLine(content)}` : "";
  const hypothesis = id === "C3-T03" ? `<article class="focus-card provisional" data-hypothesis-status="${escapeHtml(content.hypothesis_status)}"><p class="eyebrow">Relación provisional</p><h3>${escapeHtml(content.hypothesis)}</h3><span class="status-pill closed">Estado: provisional</span></article>` : `<article class="focus-card"><p class="eyebrow">Contexto disponible bajo solicitud</p><h3>Las dimensiones permanecen ocultas hasta una petición concreta.</h3></article>`;
  return `${hypothesis}${recordsTable(content.records)}${revealed}<div class="state-line"><span>Revelación</span><strong>${content.disclosure_open ? "Mínima y delimitada" : "Ninguna"}</strong><span class="count">Campos visibles: ${content.revealed_fields.length}</span></div><p class="context-note">Los campos adyacentes permanecen ocultos; no se añade interpretación, confirmación ni recomendación.</p>`;
}
export function renderExperienceHtml(run) {
  const id = run.fixture.test_id;
  const action = run.phase === "before" ? `<button type="button" class="primary-action" data-action="primary">${primaryLabels[id]}</button>` : "";
  return `<section class="experience-card" aria-labelledby="scene-title"><p class="eyebrow">F2 · W3 · revelación factual mínima</p><h2 id="scene-title">${headings[id]}</h2><div data-scene-body data-active-state="${escapeHtml(run.technical_status)}">${sceneBody(run)}</div>${action}</section>`;
}
export function renderShellHtml(run) {
  const id = run.fixture.test_id;
  const recovery = run.phase === "after" ? `<button type="button" class="technical-action" data-action="recovery">${recoveryLabels[id]}</button>` : "";
  return `<main id="experience" aria-label="Experiencia ${id}" data-test-id="${id}" data-phase="${run.phase}">${renderExperienceHtml(run)}</main><aside class="instrument-panel" aria-label="Panel técnico"><p class="eyebrow">IRP-F2 · Checkpoint 28</p><h2>${id}</h2><dl><dt>Ola</dt><dd>W3 · Revelación factual mínima</dd><dt>Escena</dt><dd>${escapeHtml(run.fixture.scene)}</dd><dt>Decisión</dt><dd>${escapeHtml(run.fixture.primary_decision)} mínimo</dd><dt>Allowlist</dt><dd>${escapeHtml(run.content.allowlist.join(", "))}</dd><dt>Estado técnico</dt><dd>${escapeHtml(run.technical_status)}</dd><dt>Eventos</dt><dd>${run.events.length}</dd><dt>Solicitudes externas</dt><dd>${run.network_requests.length}</dd></dl>${recovery}<p class="technical-limit">Valida procedencia y alcance factual observable; no interpreta, recomienda, confirma hipótesis ni certifica comprensión.</p></aside>`;
}
