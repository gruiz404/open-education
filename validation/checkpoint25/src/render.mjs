function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function visibleRecords(content) {
  if (!content.records) return [];
  if (!content.visible_record_ids) return content.records;
  const allowed = new Set(content.visible_record_ids);
  return content.records.filter((record) => allowed.has(record.record_id));
}

function recordTable(content) {
  const rows = visibleRecords(content).map((record) => `
    <tr data-record-id="${escapeHtml(record.record_id)}">
      <td>${escapeHtml(record.label)}</td><td>${escapeHtml(record.group)}</td><td>${escapeHtml(record.value)}</td>
    </tr>`).join("");
  return `<table aria-label="Conjunto de observaciones"><thead><tr><th>Caso</th><th>Grupo</th><th>Valor</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderC1(run) {
  const active = Boolean(run.content.filter);
  return `
    <section class="experience-card" aria-labelledby="scene-title">
      <div class="scene-heading"><div><p class="eyebrow">Exploración del conjunto</p><h2 id="scene-title">Filtrar sin perder información</h2></div><span class="count" aria-label="Cantidad visible">${run.content.visible_record_ids.length} de ${run.content.records.length}</span></div>
      <div class="toolbar" role="group" aria-label="Controles del conjunto">
        <button type="button" data-action="filter-a" aria-pressed="${active}">Grupo A</button>
        <button type="button" data-action="clear-filter" ${active ? "" : "disabled"}>Restablecer</button>
        <span class="criterion" data-filter-state>${active ? "Filtro activo: Grupo A" : "Sin filtro activo"}</span>
      </div>
      ${recordTable(run.content)}
      <p class="context-note">El filtro cambia la vista; el conjunto de origen permanece íntegro.</p>
    </section>`;
}

function renderC2(run) {
  const blocked = !run.content.interaction_enabled;
  const options = run.content.options.map((option) => {
    const highlighted = option.salience_token === "highlighted";
    return `<button type="button" class="option ${highlighted ? "injected-salience" : "neutral"}" data-option-id="${option.option_id}" aria-pressed="false" ${blocked ? "disabled" : ""}>${escapeHtml(option.label)}</button>`;
  }).join("");
  return `
    <section class="experience-card" aria-labelledby="scene-title">
      <p class="eyebrow">Comparación neutral</p><h2 id="scene-title">Elegí una forma de observar</h2>
      ${blocked ? '<div class="notice" role="status">Interacción pausada mientras se restablece la equivalencia visual.</div>' : '<div class="notice neutral-notice" role="status">Opciones equivalentes; ninguna está seleccionada.</div>'}
      <div class="option-grid" role="group" aria-label="Vistas disponibles">${options}</div>
      <p class="context-note">La interfaz no interpreta una opción destacada como elección del lector.</p>
    </section>`;
}

function renderC3(run) {
  return `
    <section class="experience-card" aria-labelledby="scene-title">
      <p class="eyebrow">Relaciones observables</p><h2 id="scene-title">Revisar las observaciones disponibles</h2>
      ${recordTable(run.content)}
      <p class="context-note">La escena conserva el alcance del Ciclo 3 y no promueve acciones adicionales.</p>
    </section>`;
}

export function renderExperienceHtml(run) {
  if (run.fixture.test_id === "C1-T03") return renderC1(run);
  if (run.fixture.test_id === "C2-T02") return renderC2(run);
  if (run.fixture.test_id === "C3-T04") return renderC3(run);
  throw new Error(`Render no implementado: ${run.fixture.test_id}`);
}

export function renderShellHtml(run) {
  const recoveryControl = run.phase === "after" && run.fixture.test_id !== "C3-T04"
    ? '<button type="button" class="technical-action" data-action="technical-recovery">Aplicar recuperación controlada</button>'
    : "";
  return `
    <main id="experience" aria-label="Experiencia ${run.fixture.test_id}" data-test-id="${run.fixture.test_id}" data-phase="${run.phase}">${renderExperienceHtml(run)}</main>
    <aside class="instrument-panel" aria-label="Panel técnico">
      <p class="eyebrow">IRP-F2 · ejecución local</p>
      <h2>${run.fixture.test_id}</h2>
      <dl><dt>Escena</dt><dd>${escapeHtml(run.fixture.scene)}</dd><dt>Decisión</dt><dd>${escapeHtml(run.fixture.primary_decision)}</dd><dt>Estado técnico</dt><dd>${escapeHtml(run.technical_status)}</dd><dt>Eventos</dt><dd>${run.events.length}</dd><dt>Solicitudes externas</dt><dd>${run.network_requests.length}</dd></dl>
      ${recoveryControl}
      <p class="technical-limit">Este panel informa controles técnicos; no certifica comprensión ni logro.</p>
    </aside>`;
}

export function renderAriaSnapshot(run) {
  const base = {
    role: "main",
    name: `Experiencia ${run.fixture.test_id}`,
    phase: run.phase,
    children: []
  };
  if (run.fixture.test_id === "C1-T03") {
    base.children.push(
      {role: "heading", level: 2, name: "Filtrar sin perder información"},
      {role: "button", name: "Grupo A", pressed: Boolean(run.content.filter)},
      {role: "button", name: "Restablecer", disabled: !run.content.filter},
      {role: "table", name: "Conjunto de observaciones", row_count: visibleRecords(run.content).length}
    );
  } else if (run.fixture.test_id === "C2-T02") {
    base.children.push(
      {role: "heading", level: 2, name: "Elegí una forma de observar"},
      ...run.content.options.map((option) => ({role: "button", name: option.label, pressed: false, disabled: !run.content.interaction_enabled}))
    );
  } else {
    base.children.push(
      {role: "heading", level: 2, name: "Revisar las observaciones disponibles"},
      {role: "table", name: "Conjunto de observaciones", row_count: run.content.records.length}
    );
  }
  return base;
}

function svgEscape(value) {
  return escapeHtml(value);
}

function svgTable(records, x, y, width) {
  const headerHeight = 48;
  const rowHeight = 52;
  const col1 = Math.round(width * 0.52);
  const col2 = Math.round(width * 0.24);
  const col3 = width - col1 - col2;
  let svg = `<rect x="${x}" y="${y}" width="${width}" height="${headerHeight}" rx="8" fill="#185f9f"/><text x="${x + 18}" y="${y + 31}" class="th">Caso</text><text x="${x + col1 + 18}" y="${y + 31}" class="th">Grupo</text><text x="${x + col1 + col2 + 18}" y="${y + 31}" class="th">Valor</text>`;
  records.forEach((record, index) => {
    const yy = y + headerHeight + index * rowHeight;
    const fill = index % 2 ? "#eef4f8" : "#ffffff";
    svg += `<rect x="${x}" y="${yy}" width="${width}" height="${rowHeight}" fill="${fill}" stroke="#c7d5e0"/><text x="${x + 18}" y="${yy + 33}" class="td">${svgEscape(record.label)}</text><text x="${x + col1 + 18}" y="${yy + 33}" class="td">${svgEscape(record.group)}</text><text x="${x + col1 + col2 + 18}" y="${yy + 33}" class="td">${svgEscape(record.value)}</text>`;
  });
  return svg;
}

export function renderSvgSnapshot(run, {width = 1280, height = 800} = {}) {
  const testId = run.fixture.test_id;
  const phaseLabel = {before: "Estado inicial", after: "Después de la acción", recovery: "Recuperación"}[run.phase] || run.phase;
  let content = "";
  if (testId === "C1-T03") {
    const records = visibleRecords(run.content);
    const active = Boolean(run.content.filter);
    content = `<text x="80" y="180" class="eyebrow">EXPLORACIÓN DEL CONJUNTO</text><text x="80" y="226" class="h2">Filtrar sin perder información</text>
      <rect x="80" y="260" width="150" height="46" rx="12" fill="${active ? "#185f9f" : "#ffffff"}" stroke="#185f9f"/><text x="155" y="290" text-anchor="middle" class="button ${active ? "button-inverse" : ""}">Grupo A</text>
      <rect x="246" y="260" width="160" height="46" rx="12" fill="#ffffff" stroke="${active ? "#185f9f" : "#aab7c1"}"/><text x="326" y="290" text-anchor="middle" class="button ${active ? "" : "muted"}">Restablecer</text>
      <text x="438" y="290" class="criterion">${active ? "Filtro activo: Grupo A" : "Sin filtro activo"}</text>
      <rect x="886" y="179" width="176" height="54" rx="27" fill="#e6f2fb"/><text x="974" y="214" text-anchor="middle" class="count">${records.length} de ${run.content.records.length}</text>
      ${svgTable(records, 80, 334, 982)}
      <text x="80" y="${Math.min(724, 334 + 48 + records.length * 52 + 42)}" class="note">El filtro cambia la vista; el conjunto de origen permanece íntegro.</text>`;
  } else if (testId === "C2-T02") {
    const blocked = !run.content.interaction_enabled;
    const optionA = run.content.options[0];
    const optionB = run.content.options[1];
    const y = 340;
    const box = (x, option) => {
      const highlight = option.salience_token === "highlighted";
      return `<rect x="${x}" y="${y}" width="360" height="128" rx="20" fill="${highlight ? "#e8f2ff" : "#ffffff"}" stroke="${highlight ? "#185f9f" : "#8ca0af"}" stroke-width="${highlight ? 4 : 2}"/><text x="${x + 180}" y="${y + 75}" text-anchor="middle" class="option-text">${svgEscape(option.label)}</text>`;
    };
    content = `<text x="80" y="190" class="eyebrow">COMPARACIÓN NEUTRAL</text><text x="80" y="240" class="h2">Elegí una forma de observar</text>
      <rect x="80" y="268" width="920" height="54" rx="12" fill="${blocked ? "#fff1c7" : "#e6f6ea"}"/><text x="104" y="302" class="notice-text">${blocked ? "Interacción pausada mientras se restablece la equivalencia visual." : "Opciones equivalentes; ninguna está seleccionada."}</text>
      ${box(80, optionA)}${box(480, optionB)}
      <text x="80" y="520" class="note">La interfaz no interpreta una opción destacada como elección del lector.</text>`;
  } else {
    content = `<text x="80" y="190" class="eyebrow">RELACIONES OBSERVABLES</text><text x="80" y="240" class="h2">Revisar las observaciones disponibles</text>
      ${svgTable(run.content.records, 80, 286, 920)}
      <text x="80" y="540" class="note">La escena conserva el alcance del Ciclo 3 y no promueve acciones adicionales.</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <style>
      text{font-family:Arial,Helvetica,sans-serif;fill:#233746}.brand{font-size:21px;font-weight:700;fill:#185f9f}.phase{font-size:18px;fill:#607482}.eyebrow{font-size:16px;font-weight:700;letter-spacing:1.5px;fill:#397db8}.h2{font-size:34px;font-weight:700;fill:#164f7d}.th{font-size:18px;font-weight:700;fill:#fff}.td{font-size:18px}.button{font-size:18px;font-weight:700;fill:#185f9f}.button-inverse{fill:#fff}.muted{fill:#8a9aa6}.criterion{font-size:18px;fill:#334f62}.count{font-size:19px;font-weight:700;fill:#185f9f}.note{font-size:17px;fill:#5b6d78}.notice-text{font-size:17px;font-weight:700;fill:#384c59}.option-text{font-size:24px;font-weight:700;fill:#164f7d}.panel-title{font-size:18px;font-weight:700;fill:#ffffff}.panel-label{font-size:13px;font-weight:700;fill:#9fc0d6}.panel-value{font-size:16px;fill:#ffffff}.footer{font-size:13px;fill:#6d7f8b}
    </style>
    <rect width="${width}" height="${height}" fill="#f4f8fb"/>
    <rect x="0" y="0" width="${width}" height="92" fill="#ffffff"/>
    <text x="80" y="55" class="brand">OPEN EDUCATION · IRP-F2</text><text x="1000" y="55" class="phase">${svgEscape(phaseLabel)}</text>
    <rect x="52" y="118" width="1036" height="616" rx="24" fill="#ffffff" stroke="#d8e3eb"/>
    ${content}
    <rect x="1112" y="118" width="140" height="616" rx="20" fill="#173d5a"/>
    <text x="1132" y="160" class="panel-title" fill="#fff">${testId}</text>
    <text x="1132" y="200" class="panel-label" fill="#9fc0d6">DECISIÓN</text><text x="1132" y="225" class="panel-value" fill="#fff">${run.fixture.primary_decision}</text>
    <text x="1132" y="268" class="panel-label" fill="#9fc0d6">EVENTOS</text><text x="1132" y="293" class="panel-value" fill="#fff">${run.events.length}</text>
    <text x="1132" y="336" class="panel-label" fill="#9fc0d6">RED EXTERNA</text><text x="1132" y="361" class="panel-value" fill="#fff">0</text>
    <text x="80" y="773" class="footer">Captura determinista · no certifica comprensión ni logro cognitivo</text>
  </svg>`;
}

export function visualMetrics(run) {
  if (run.fixture.test_id !== "C2-T02") return {applicable: false};
  return {
    applicable: true,
    phase: run.phase,
    options: run.content.options.map((option) => ({
      option_id: option.option_id,
      selected: false,
      enabled: run.content.interaction_enabled,
      salience_token: option.salience_token,
      computed_reference: option.salience_token === "neutral"
        ? {background: "#ffffff", border: "2px solid #8ca0af", font_weight: 700, scale: 1}
        : {background: "#e8f2ff", border: "4px solid #185f9f", font_weight: 700, scale: 1}
    }))
  };
}
