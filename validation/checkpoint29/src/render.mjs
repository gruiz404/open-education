const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const headings = {
  "C2-T09": "Continuar la exploración en el Ciclo 2",
  "C3-T04": "Mantener la relación provisional en el Ciclo 3"
};
const primaryLabel = "Ejecutar intento técnico controlado";
const recoveryLabel = "Continuar escena autorizada";

function recordsTable(records) {
  return `<table aria-label="Datos sintéticos preservados" data-mounted-component="observation_table"><thead><tr><th>ID</th><th>Grupo</th><th>Valor</th></tr></thead><tbody>${records.map((row) => `<tr><td>${escapeHtml(row.record_id)}</td><td>${escapeHtml(row.group)}</td><td>${escapeHtml(row.value)}</td></tr>`).join("")}</tbody></table>`;
}

function sceneBody(run) {
  const content = run.content;
  if (run.fixture.test_id === "C2-T09") {
    return `<article class="focus-card"><p class="eyebrow">Pregunta activa</p><h3>${escapeHtml(content.active_question)}</h3></article>${recordsTable(content.records)}<div class="state-line"><span>Ciclo activo</span><strong>Ciclo 2</strong><span class="count">Ruta forzada: ninguna</span></div><p class="context-note" data-mounted-component="context_note">La escena continúa disponible sin imponer una etapa adicional.</p>`;
  }
  return `<article class="focus-card provisional" data-hypothesis-status="${escapeHtml(content.hypothesis_status)}"><p class="eyebrow">Relación provisional</p><h3>${escapeHtml(content.hypothesis)}</h3><span class="status-pill closed">Estado: provisional</span></article>${recordsTable(content.records)}<div class="state-line"><span>Ciclo activo</span><strong>Ciclo 3</strong><span class="count">Promoción: ninguna</span></div><p class="context-note" data-mounted-component="context_note">La relación permanece abierta y la escena continúa sin evaluación automática.</p>`;
}

export function renderExperienceHtml(run) {
  const id = run.fixture.test_id;
  return `<section class="experience-card" aria-labelledby="scene-title"><p class="eyebrow">F2 · W4 · frontera del Ciclo 4</p><h2 id="scene-title">${headings[id]}</h2><div data-scene-body data-active-state="${escapeHtml(run.technical_status)}">${sceneBody(run)}</div></section>`;
}

export function renderShellHtml(run) {
  const id = run.fixture.test_id;
  const primary = run.phase === "before" ? `<button type="button" class="technical-action" data-action="primary">${primaryLabel}</button>` : "";
  const recovery = run.phase === "after" ? `<button type="button" class="technical-action" data-action="recovery">${recoveryLabel}</button>` : "";
  return `<main id="experience" aria-label="Experiencia ${id}" data-test-id="${id}" data-phase="${run.phase}">${renderExperienceHtml(run)}</main><aside class="instrument-panel" aria-label="Panel técnico"><p class="eyebrow">IRP-F2 · Checkpoint 29</p><h2>${id}</h2><dl><dt>Ola</dt><dd>W4 · Frontera del Ciclo 4</dd><dt>Escena</dt><dd>${escapeHtml(run.fixture.scene)}</dd><dt>Decisión</dt><dd>BLOCK · reservado a C4</dd><dt>Frontera</dt><dd>Ciclo 4 deshabilitado</dd><dt>Estado técnico</dt><dd>${escapeHtml(run.technical_status)}</dd><dt>Intentos bloqueados</dt><dd>${run.content.blocked_mount_attempts}</dd><dt>Eventos</dt><dd>${run.events.length}</dd><dt>Solicitudes externas</dt><dd>${run.network_requests.length}</dd></dl>${primary}${recovery}<p class="technical-limit">El panel registra el bloqueo técnico. La experiencia no monta consigna, sustituto, control de contraste ni evaluación.</p></aside>`;
}

export const labels = {headings, primaryLabel, recoveryLabel};
