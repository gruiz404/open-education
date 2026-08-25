const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const headings = {
  "C1-T06": "Elegir una vista sin inducir comprensión",
  "C1-T08": "Comparar dos vistas equivalentes",
  "C2-T02": "Neutralizar una opción destacada",
  "C2-T05": "Elegir una agrupación neutral",
  "C2-T06": "Registrar qué quedó menos visible",
  "C3-T06": "Contrastar casos sin favorecer una conclusión"
};

const primaryLabels = {
  "C1-T06": "Seleccionar Vista B",
  "C1-T08": "Comparar y registrar observación",
  "C2-T02": "Neutralizar opciones",
  "C2-T05": "Seleccionar Agrupación B",
  "C2-T06": "Registrar límite de visibilidad",
  "C3-T06": "Abrir comparación equilibrada"
};

const recoveryLabels = {
  "C1-T06": "Deshacer selección",
  "C1-T08": "Cerrar comparación",
  "C2-T02": "Remontar escena neutralizada",
  "C2-T05": "Deshacer agrupación",
  "C2-T06": "Volver a vista anterior",
  "C3-T06": "Cerrar comparación"
};

function optionCards(items, {idKey, injectedDefault = null} = {}) {
  return `<div class="neutral-grid" aria-label="Opciones equivalentes">${items.map((item) => {
    const id = item[idKey];
    const injected = id === injectedDefault;
    return `<article class="neutral-option${injected ? " injected-default" : ""}" data-neutral-option data-option-id="${escapeHtml(id)}"${injected ? ' data-default-option="true"' : ""}><p class="eyebrow">${escapeHtml(item.label)}</p><h3>${escapeHtml(item.description)}</h3></article>`;
  }).join("")}</div>`;
}

function sceneBody(run) {
  const {test_id: id} = run.fixture;
  const content = run.content;

  if (id === "C1-T06") {
    return `${optionCards(content.views, {idKey: "view_id"})}<div class="state-line"><span>Vista activa</span><strong>${escapeHtml(content.view_id === "view_A" ? "Vista A" : "Vista B")}</strong><span class="count">Comprensión: no inferida</span></div><p class="context-note">Las dos vistas mantienen el mismo tamaño, color y peso visual.</p>`;
  }
  if (id === "C1-T08") {
    const observation = content.observation ? `<blockquote class="reader-note"><span>Observación del lector</span>${escapeHtml(content.observation.text)}</blockquote>` : "";
    return `${optionCards(content.views, {idKey: "view_id"})}<div class="state-line"><span>Comparación</span><strong>${content.comparison_open ? "Abierta" : "Disponible"}</strong><span class="count">Sin vista recomendada</span></div>${observation}<p class="context-note">La observación conserva procedencia del lector y no jerarquiza las vistas.</p>`;
  }
  if (id === "C2-T02") {
    const status = content.interaction_enabled ? "Interacción habilitada" : "Interacción bloqueada";
    return `<div data-interaction-enabled="${content.interaction_enabled}">${optionCards(content.options, {idKey: "option_id", injectedDefault: content.default_option})}<div class="state-line ${content.interaction_enabled ? "neutral-state" : "blocked-state"}"><span>Control de neutralidad</span><strong>${status}</strong><span class="count">Elección: ninguna</span></div><p class="context-note">${content.interaction_enabled ? "Las opciones quedaron equivalentes; ninguna selección fue atribuida al lector." : "La opción destacada fue detectada. No se permite continuar con saliencia desigual."}</p></div>`;
  }
  if (id === "C2-T05") {
    return `${optionCards(content.groupings, {idKey: "grouping_id"})}<div class="state-line"><span>Agrupación activa</span><strong>${content.grouping_id === "option_A" ? "Agrupación A" : "Agrupación B"}</strong><span class="count">Comprensión: no inferida</span></div><p class="context-note">La selección cambia el criterio operativo, no certifica una interpretación.</p>`;
  }
  if (id === "C2-T06") {
    const limit = content.visibility_limit ? `<blockquote class="reader-note"><span>Límite señalado por el lector</span>${escapeHtml(content.visibility_limit.text)}</blockquote>` : "";
    return `${optionCards(content.views, {idKey: "view_id"})}<div class="state-line"><span>Vista activa</span><strong>${content.active_view_id === "view_grouped" ? "Vista agrupada" : "Vista anterior"}</strong><span class="count">Retorno ${content.return_option_exposed ? "disponible" : "preparado"}</span></div>${limit}<p class="context-note">La alternativa de retorno no sugiere una interpretación ni una herramienta.</p>`;
  }

  const supporting = content.cases.filter(({kind}) => kind === "supporting");
  const contradicting = content.cases.filter(({kind}) => kind === "contradicting");
  const panel = (title, items) => `<article class="neutral-option case-panel" data-neutral-option><p class="eyebrow">${title}</p>${items.map((item) => `<div class="case-row"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.value)}</span></div>`).join("")}</article>`;
  return `<div class="neutral-grid balanced-cases" aria-label="Casos favorables y contradictorios">${panel("Casos favorables", supporting)}${panel("Casos contradictorios", contradicting)}</div><div class="state-line"><span>Comparación</span><strong>${content.comparison_open ? "Abierta y equilibrada" : "Disponible"}</strong><span class="count">Confirmación: ninguna</span></div><p class="context-note">Ambos conjuntos conservan igual cantidad, tamaño, orden y peso visual.</p>`;
}

export function renderExperienceHtml(run) {
  const id = run.fixture.test_id;
  const action = run.phase === "before" && id !== "C2-T02" ? `<button type="button" class="primary-action" data-action="primary">${primaryLabels[id]}</button>` : "";
  return `<section class="experience-card" aria-labelledby="scene-title"><p class="eyebrow">F2 · W2 · neutralidad y comparación</p><h2 id="scene-title">${headings[id]}</h2><div data-scene-body data-active-state="${escapeHtml(run.technical_status)}">${sceneBody(run)}</div>${action}</section>`;
}

export function renderShellHtml(run) {
  const id = run.fixture.test_id;
  const systemRepair = run.phase === "before" && id === "C2-T02" ? `<button type="button" class="technical-action" data-action="primary">${primaryLabels[id]}</button>` : "";
  const recovery = run.phase === "after" ? `<button type="button" class="technical-action" data-action="recovery">${recoveryLabels[id]}</button>` : "";
  return `<main id="experience" aria-label="Experiencia ${id}" data-test-id="${id}" data-phase="${run.phase}">${renderExperienceHtml(run)}</main>
    <aside class="instrument-panel" aria-label="Panel técnico"><p class="eyebrow">IRP-F2 · Checkpoint 27</p><h2>${id}</h2><dl><dt>Ola</dt><dd>W2 · Neutralidad y comparación</dd><dt>Escena</dt><dd>${escapeHtml(run.fixture.scene)}</dd><dt>Decisión</dt><dd>${escapeHtml(run.fixture.primary_decision)}</dd><dt>Estado técnico</dt><dd>${escapeHtml(run.technical_status)}</dd><dt>Eventos</dt><dd>${run.events.length}</dd><dt>Solicitudes externas</dt><dd>${run.network_requests.length}</dd></dl>${systemRepair}${recovery}<p class="technical-limit">Valida neutralidad observable; no certifica comprensión, preferencia ni validez.</p></aside>`;
}
