const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const headings = {
  "C1-T01": "Ordenar sin perder el conjunto",
  "C1-T03": "Filtrar sin perder información",
  "C1-T05": "Cambiar la representación",
  "C1-T07": "Recuperar una agrupación",
  "C2-T04": "Recorrer vistas sin perder el camino",
  "C2-T10": "Cambiar de pregunta y conservar versiones",
  "C3-T08": "Reformular una relación provisional",
  "C3-T11": "Cerrar y reabrir una hipótesis provisional"
};

const primaryLabels = {
  "C1-T01": "Ordenar por valor ascendente",
  "C1-T03": "Filtrar Grupo A",
  "C1-T05": "Mostrar gráfico de puntos",
  "C1-T07": "Restaurar agrupación original",
  "C2-T04": "Restaurar vista anterior",
  "C2-T10": "Cambiar a pregunta B",
  "C3-T08": "Reformular relación",
  "C3-T11": "Abandonar hipótesis"
};

const recoveryLabels = {
  "C1-T01": "Deshacer ordenamiento",
  "C1-T03": "Restablecer conjunto",
  "C1-T05": "Volver a tabla",
  "C1-T07": "Volver a agrupación modificada",
  "C2-T04": "Rehacer vista actual",
  "C2-T10": "Restaurar pregunta A",
  "C3-T08": "Activar relación v1",
  "C3-T11": "Reabrir hipótesis"
};

function visibleRecords(content) {
  let selected = content.records || [];
  if (content.visible_record_ids) {
    const allowed = new Set(content.visible_record_ids);
    selected = selected.filter(({record_id}) => allowed.has(record_id));
  }
  if (content.record_order) {
    const position = new Map(content.record_order.map((id, index) => [id, index]));
    selected = [...selected].sort((a, b) => position.get(a.record_id) - position.get(b.record_id));
  }
  return selected;
}

function recordTable(content, label = "Conjunto de observaciones") {
  const rows = visibleRecords(content).map((record) => `
    <tr data-record-id="${escapeHtml(record.record_id)}"><td>${escapeHtml(record.label)}</td><td>${escapeHtml(record.group)}</td><td>${escapeHtml(record.value)}</td></tr>`).join("");
  return `<table aria-label="${escapeHtml(label)}"><thead><tr><th>Caso</th><th>Grupo</th><th>Valor</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function dotPlot(content) {
  const rows = visibleRecords(content).map((record) => `
    <li><span>${escapeHtml(record.label)}</span><span class="dot-track"><i style="width:${Math.max(10, Math.min(94, record.value * 4))}%"></i></span><strong>${escapeHtml(record.value)}</strong></li>`).join("");
  return `<div class="dot-plot" role="img" aria-label="Gráfico de puntos de ${visibleRecords(content).length} observaciones"><ul>${rows}</ul></div>`;
}

function sceneBody(run) {
  const {test_id: id} = run.fixture;
  const content = run.content;
  if (id === "C1-T01") {
    return `<div class="state-line"><span>Orden</span><strong>${content.sort ? "Valor ascendente" : "Orden original"}</strong></div>${recordTable(content)}<p class="context-note">Cambiar el orden no modifica identificadores ni valores.</p>`;
  }
  if (id === "C1-T03") {
    return `<div class="state-line"><span>Vista</span><strong>${content.filter ? "Filtro activo: Grupo A" : "Conjunto completo"}</strong><span class="count">${content.visible_record_ids.length} de ${content.records.length}</span></div>${recordTable(content)}<p class="context-note">El filtro cambia la vista; el conjunto de origen permanece íntegro.</p>`;
  }
  if (id === "C1-T05") {
    const view = content.representation_id === "dot_plot" ? dotPlot(content) : recordTable(content);
    return `<div class="state-line"><span>Representación activa</span><strong>${content.representation_id === "dot_plot" ? "Gráfico de puntos" : "Tabla"}</strong></div>${view}<p class="context-note">Los mismos campos y datos permanecen disponibles.</p>`;
  }
  if (id === "C1-T07") {
    return `<div class="state-line"><span>Agrupación activa</span><strong>${content.grouping_id === "grouping_original" ? "Original" : "Modificada"}</strong></div>${recordTable(content, "Observaciones agrupadas")}<div class="history-strip" aria-label="Trayectoria de agrupaciones">${content.grouping_history.map((item) => `<span>${item === "grouping_original" ? "Original" : "Modificada"}</span>`).join("")}</div><p class="context-note">La trayectoria conserva ambas agrupaciones.</p>`;
  }
  if (id === "C2-T04") {
    const active = content.views.find(({view_id}) => view_id === content.active_view_id);
    return `<article class="focus-card"><p class="eyebrow">${escapeHtml(active.label)}</p><h3>${escapeHtml(active.focus)}</h3></article><div class="history-strip" aria-label="Recorrido de vistas">${content.view_history.map((viewId) => `<span class="${viewId === content.active_view_id ? "active" : ""}">${escapeHtml(content.views.find(({view_id}) => view_id === viewId).label)}</span>`).join("")}</div><p class="context-note">El recorrido anterior y la dirección de avance permanecen disponibles.</p>`;
  }
  if (id === "C2-T10") {
    const active = content.question_versions.find(({version}) => version === content.active_question_version);
    return `<article class="focus-card"><p class="eyebrow">Pregunta activa · v${active.version}</p><h3>${escapeHtml(active.text)}</h3></article><div class="version-list" aria-label="Versiones de la pregunta">${content.question_versions.map((item) => `<span class="${item.version === content.active_question_version ? "active" : ""}">v${item.version} · ${escapeHtml(item.question_id)}</span>`).join("")}</div><p class="context-note">Cambiar el foco no impone una respuesta ni altera el ciclo.</p>`;
  }
  if (id === "C3-T08") {
    const active = content.relation_versions.find(({version}) => version === content.active_relation_version);
    return `<article class="focus-card provisional"><p class="eyebrow">Relación activa · v${active.version} · provisional</p><h3>${escapeHtml(active.text)}</h3></article><div class="version-list" aria-label="Versiones de la relación">${content.relation_versions.map((item) => `<span class="${item.version === content.active_relation_version ? "active" : ""}">v${item.version} · ${escapeHtml(item.relation_id)}</span>`).join("")}</div><p class="context-note">Ninguna versión constituye certificación o confirmación.</p>`;
  }
  const open = content.hypothesis_status === "OPEN_PROVISIONAL";
  return `<article class="focus-card provisional"><p class="eyebrow">Hipótesis · provisional</p><h3>${escapeHtml(content.hypothesis_text)}</h3><span class="status-pill ${open ? "open" : "closed"}">${open ? "Provisional activa" : "Cierre provisional"}</span></article><p class="context-note">${open ? "La línea puede continuar sin puntuación ni validación." : "La hipótesis permanece en el historial y puede reabrirse."}</p>`;
}

export function renderExperienceHtml(run) {
  const id = run.fixture.test_id;
  const action = run.phase === "before" ? `<button type="button" class="primary-action" data-action="primary">${primaryLabels[id]}</button>` : "";
  return `<section class="experience-card" aria-labelledby="scene-title"><p class="eyebrow">F2 · W1 · transformación y recuperación</p><h2 id="scene-title">${headings[id]}</h2><div data-scene-body data-active-state="${escapeHtml(run.technical_status)}">${sceneBody(run)}</div>${action}</section>`;
}

export function renderShellHtml(run) {
  const id = run.fixture.test_id;
  const recovery = run.phase === "after" ? `<button type="button" class="technical-action" data-action="recovery">${recoveryLabels[id]}</button>` : "";
  return `<main id="experience" aria-label="Experiencia ${id}" data-test-id="${id}" data-phase="${run.phase}">${renderExperienceHtml(run)}</main>
    <aside class="instrument-panel" aria-label="Panel técnico"><p class="eyebrow">IRP-F2 · Checkpoint 26</p><h2>${id}</h2><dl><dt>Ola</dt><dd>W1 · Transformación y recuperación</dd><dt>Escena</dt><dd>${escapeHtml(run.fixture.scene)}</dd><dt>Decisión</dt><dd>${escapeHtml(run.fixture.primary_decision)}</dd><dt>Estado técnico</dt><dd>${escapeHtml(run.technical_status)}</dd><dt>Eventos</dt><dd>${run.events.length}</dd><dt>Solicitudes externas</dt><dd>${run.network_requests.length}</dd></dl>${recovery}<p class="technical-limit">Valida conducta técnica observable; no certifica comprensión ni logro.</p></aside>`;
}
