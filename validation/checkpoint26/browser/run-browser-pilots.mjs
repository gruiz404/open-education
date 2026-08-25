import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdir, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserResultsRoot = path.join(packageRoot, "browser-results");
const oracle = JSON.parse(await readFile(path.join(packageRoot, "browser", "contract-oracle.json"), "utf8"));
const caseIds = Object.keys(oracle.cases);
const exactRecoveryIds = new Set(["C1-T01", "C1-T03", "C1-T05", "C1-T07", "C2-T04"]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stableStringify = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
};
const pass = (checkId, ok, detail) => ({check_id: checkId, status: ok ? "PASS" : "FAIL", detail});
const writeJson = async (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");

function pngInfo(buffer) {
  const signature = buffer.subarray(0, 8).toString("hex");
  return {
    valid: signature === "89504e470d0a1a0a" && buffer.length > 4000,
    bytes: buffer.length,
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    sha256: sha256(buffer)
  };
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Servidor no disponible después de ${timeoutMs} ms`);
}

function contractState(testId, phase, state, initialHash) {
  const content = state.content;
  const common = state.checkpoint === 26 && state.wave === "W1" && state.test_id === testId && state.phase === phase && state.state_hash_scope === "content";
  if (!common) return {ok: false, detail: "Metadatos de estado no conformes"};
  if (phase === "before") return {ok: state.history_refs.length === 0, detail: `initial=${state.state_hash}; history=${state.history_refs.length}`};
  if (phase === "after") {
    let ok = false;
    if (testId === "C1-T01") ok = content.sort?.field === "value" && content.sort?.direction === "ascending" && stableStringify(content.record_order) === stableStringify(oracle.cases[testId].after.record_order);
    if (testId === "C1-T03") ok = stableStringify(content.visible_record_ids) === stableStringify(oracle.cases[testId].after.visible_record_ids) && content.records.length === 6;
    if (testId === "C1-T05") ok = content.representation_id === "dot_plot" && content.records.length === 4;
    if (testId === "C1-T07") ok = content.grouping_id === "grouping_original" && stableStringify(content.records.map(({group}) => group)) === stableStringify(oracle.cases[testId].after.groups) && stableStringify(content.grouping_history) === stableStringify(oracle.cases[testId].after.history);
    if (testId === "C2-T04") ok = content.active_view_id === "view_previous" && stableStringify(content.navigation.forward) === stableStringify(["view_current"]) && stableStringify(content.view_history) === stableStringify(oracle.cases[testId].after.history);
    if (testId === "C2-T10") ok = content.active_question_version === 2 && content.question_versions.length === 2 && content.question_version_counter === 2 && content.cycle === 2;
    if (testId === "C3-T08") ok = content.active_relation_version === 2 && content.relation_versions.length === 2 && content.relation_versions.every(({status}) => status === "PROVISIONAL") && content.certification === "NONE";
    if (testId === "C3-T11") ok = content.hypothesis_status === "CLOSED_PROVISIONAL" && content.closure_history.length === 1;
    return {ok, detail: `after_hash=${state.state_hash}; history=${state.history_refs.length}`};
  }
  let ok = false;
  if (exactRecoveryIds.has(testId)) ok = state.state_hash === initialHash;
  if (testId === "C2-T10") ok = content.active_question_version === 1 && content.question_versions.length === 2 && content.question_version_counter === 2 && content.cycle === 2;
  if (testId === "C3-T08") ok = content.active_relation_version === 1 && content.relation_versions.length === 2 && content.relation_versions.every(({status}) => status === "PROVISIONAL") && content.certification === "NONE";
  if (testId === "C3-T11") ok = content.hypothesis_status === "OPEN_PROVISIONAL" && stableStringify(content.closure_history.map(({action}) => action)) === stableStringify(["CLOSE_PROVISIONAL", "REOPEN_PROVISIONAL"]);
  return {ok, detail: `recovery=${oracle.cases[testId].recovery_contract}; hash=${state.state_hash}`};
}

async function ariaEvidence(page, testId, phase) {
  const spec = oracle.cases[testId];
  const main = page.locator("#experience");
  const primary = page.getByRole("button", {name: spec.primary_action, exact: true});
  const recovery = page.getByRole("button", {name: spec.recovery_action, exact: true});
  return {
    role: await main.evaluate((element) => element.tagName.toLowerCase() === "main" ? "main" : "generic"),
    name: await main.getAttribute("aria-label"),
    phase: await main.getAttribute("data-phase"),
    heading: await page.getByRole("heading", {level: 2, name: spec.heading, exact: true}).innerText(),
    primary_action_present: await primary.count() === 1,
    recovery_action_present: await recovery.count() === 1
  };
}

async function domCheck(page, testId, phase) {
  const spec = oracle.cases[testId];
  const actual = await page.evaluate(({id, expectedPhase}) => ({
    test_id: document.querySelector("#experience")?.getAttribute("data-test-id"),
    phase: document.querySelector("#experience")?.getAttribute("data-phase"),
    scene_body_count: document.querySelectorAll("#experience [data-scene-body]").length,
    prohibited_nodes: document.querySelectorAll("#experience [data-score], #experience [data-recommendation], #experience [data-certification]").length,
    heading: document.querySelector("#scene-title")?.textContent.trim(),
    primary_count: document.querySelectorAll('#experience [data-action="primary"]').length,
    recovery_count: document.querySelectorAll('[data-action="recovery"]').length
  }), {id: testId, expectedPhase: phase});
  const expectedPrimary = phase === "before" ? 1 : 0;
  const expectedRecovery = phase === "after" ? 1 : 0;
  const ok = actual.test_id === testId && actual.phase === phase && actual.scene_body_count === 1 && actual.prohibited_nodes === 0 && actual.heading === spec.heading && actual.primary_count === expectedPrimary && actual.recovery_count === expectedRecovery;
  return {ok, detail: stableStringify(actual)};
}

async function computedEvidence(page) {
  return page.evaluate(() => {
    const styleOf = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        background_color: style.backgroundColor,
        border_color: style.borderColor,
        border_width: style.borderWidth,
        font_weight: style.fontWeight,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        visible: rect.width > 0 && rect.height > 0
      };
    };
    return {
      viewport: {width: innerWidth, height: innerHeight, device_pixel_ratio: devicePixelRatio},
      experience: styleOf("#experience .experience-card"),
      scene_body: styleOf("#experience [data-scene-body]")
    };
  });
}

async function capturePhase(page, testId, phase, pilotDir, initialHash) {
  const actualState = await page.evaluate(() => window.IRPF2.stateEvidence());
  const stateContract = contractState(testId, phase, actualState, initialHash || actualState.state_hash);
  const actualDom = await page.locator("#experience .experience-card").evaluate((element) => element.outerHTML);
  const domContract = await domCheck(page, testId, phase);
  const aria = await ariaEvidence(page, testId, phase);
  const spec = oracle.cases[testId];
  const expectedAria = {
    role: "main",
    name: `Experiencia ${testId}`,
    phase,
    heading: spec.heading,
    primary_action_present: phase === "before",
    recovery_action_present: phase === "after"
  };
  const ariaYaml = await page.locator("#workspace").ariaSnapshot();
  const computed = await computedEvidence(page);
  const fullPng = await page.screenshot({fullPage: true});
  const experiencePng = await page.locator("#experience [data-scene-body]").screenshot();
  const fullInfo = pngInfo(fullPng);
  const experienceInfo = pngInfo(experiencePng);

  await writeJson(path.join(pilotDir, `state_${phase}.json`), actualState);
  await writeFile(path.join(pilotDir, `dom_${phase}.html`), `${actualDom}\n`, "utf8");
  await writeJson(path.join(pilotDir, `aria_${phase}_actual.json`), aria);
  await writeFile(path.join(pilotDir, `aria_${phase}_playwright.yml`), `${ariaYaml.trim()}\n`, "utf8");
  await writeJson(path.join(pilotDir, `computed_${phase}.json`), computed);
  await writeFile(path.join(pilotDir, "screenshots", `${phase}.png`), fullPng);
  await writeFile(path.join(pilotDir, "screenshots", `${phase}_experience.png`), experiencePng);

  return {
    checks: [
      pass(`${phase.toUpperCase()}_STATE_CONTRACT`, stateContract.ok, stateContract.detail),
      pass(`${phase.toUpperCase()}_DOM_STRUCTURE`, domContract.ok, domContract.detail),
      pass(`${phase.toUpperCase()}_ARIA`, stableStringify(aria) === stableStringify(expectedAria), stableStringify(aria)),
      pass(`${phase.toUpperCase()}_SCREENSHOTS`, fullInfo.valid && experienceInfo.valid, `full=${fullInfo.width}x${fullInfo.height}/${fullInfo.bytes} B; experience=${experienceInfo.width}x${experienceInfo.height}/${experienceInfo.bytes} B`)
    ],
    evidence: {state: actualState, computed, full: fullInfo, experience: experienceInfo}
  };
}

function integrityCheck(testId, before, after, recovery) {
  const b = before.evidence.state.content;
  const a = after.evidence.state.content;
  const r = recovery.evidence.state.content;
  if (b.records) {
    const signature = (content) => stableStringify(content.records.map(({record_id, value}) => ({record_id, value})).sort((x, y) => x.record_id.localeCompare(y.record_id)));
    return {ok: signature(b) === signature(a) && signature(b) === signature(r), detail: `${b.records.length} identificadores/valores preservados`};
  }
  if (testId === "C2-T04") return {ok: stableStringify(b.view_history) === stableStringify(a.view_history) && stableStringify(b.view_history) === stableStringify(r.view_history), detail: "Trayectoria de vistas preservada"};
  if (testId === "C2-T10") return {ok: b.question_versions.length === 1 && a.question_versions.length === 2 && r.question_versions.length === 2, detail: "Versiones de pregunta 1 > 2 > 2"};
  if (testId === "C3-T08") return {ok: b.relation_versions.length === 1 && a.relation_versions.length === 2 && r.relation_versions.length === 2, detail: "Versiones de relación 1 > 2 > 2"};
  return {ok: b.closure_history.length === 0 && a.closure_history.length === 1 && r.closure_history.length === 2, detail: "Historial de cierre 0 > 1 > 2"};
}

async function runCase(page, testId, networkRequests, consoleErrors) {
  const pilotDir = path.join(browserResultsRoot, testId);
  await mkdir(path.join(pilotDir, "screenshots"), {recursive: true});
  const networkStart = networkRequests.length;
  const consoleStart = consoleErrors.length;
  await page.evaluate((id) => window.IRPF2.loadBefore(id), testId);
  const before = await capturePhase(page, testId, "before", pilotDir);
  const initialHash = before.evidence.state.state_hash;

  await page.getByRole("button", {name: oracle.cases[testId].primary_action, exact: true}).click();
  await page.waitForFunction(() => document.querySelector("#experience")?.dataset.phase === "after");
  const after = await capturePhase(page, testId, "after", pilotDir, initialHash);

  await page.getByRole("button", {name: oracle.cases[testId].recovery_action, exact: true}).click();
  await page.waitForFunction(() => document.querySelector("#experience")?.dataset.phase === "recovery");
  const recovery = await capturePhase(page, testId, "recovery", pilotDir, initialHash);

  const events = await page.evaluate(() => window.IRPF2.run.events);
  const eventTypes = events.map(({event_type}) => event_type);
  await writeFile(path.join(pilotDir, "events.ndjson"), `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
  const integrity = integrityCheck(testId, before, after, recovery);
  const expectedEvents = oracle.cases[testId].events;
  const prohibited = await page.locator("#experience [data-score], #experience [data-recommendation], #experience [data-certification]").count();
  const historyLinks = recovery.evidence.state.history_refs;
  const recoveryVisual = exactRecoveryIds.has(testId)
    ? before.evidence.experience.sha256 === recovery.evidence.experience.sha256
    : recovery.checks[0].status === "PASS";

  const checks = [
    ...before.checks,
    ...after.checks,
    ...recovery.checks,
    pass("EVENTS_MATCH_ORACLE", stableStringify(eventTypes) === stableStringify(expectedEvents), eventTypes.join(" > ")),
    pass("EVENT_HISTORY_LINKS", historyLinks.length === events.length && new Set(historyLinks).size === historyLinks.length, `${historyLinks.length}/${events.length}`),
    pass("CONTENT_AND_HISTORY_INTEGRITY", integrity.ok, integrity.detail),
    pass("RECOVERY_VISUAL_OR_SEMANTIC", recoveryVisual, exactRecoveryIds.has(testId) ? `before=${before.evidence.experience.sha256}; recovery=${recovery.evidence.experience.sha256}` : oracle.cases[testId].recovery_contract),
    pass("PROHIBITED_UI_ABSENT", prohibited === 0, `prohibited_nodes=${prohibited}`),
    pass("EXTERNAL_NETWORK", networkRequests.length === networkStart, networkRequests.length === networkStart ? "0 solicitudes externas" : networkRequests.slice(networkStart).join("; ")),
    pass("CONSOLE_ERRORS", consoleErrors.length === consoleStart, consoleErrors.length === consoleStart ? "0 errores" : consoleErrors.slice(consoleStart).join("; "))
  ];
  const status = checks.every(({status: itemStatus}) => itemStatus === "PASS") ? "PASS" : "FAIL";
  const result = {schema_version: "oe-irp-f2-browser-case-0.2", checkpoint: 26, wave: "W1", test_id: testId, status, checks};
  await writeJson(path.join(pilotDir, "checks.json"), result);
  return result;
}

async function writeChecksums(root) {
  const {readdir, stat} = await import("node:fs/promises");
  const files = [];
  async function walk(dir) {
    for (const name of (await readdir(dir)).sort()) {
      const absolute = path.join(dir, name);
      const info = await stat(absolute);
      if (info.isDirectory()) await walk(absolute);
      else if (name !== "SHA256SUMS.txt" && name !== "audit.json") files.push(absolute);
    }
  }
  await walk(root);
  const lines = [];
  for (const absolute of files) lines.push(`${sha256(await readFile(absolute))}  ${path.relative(root, absolute).replaceAll(path.sep, "/")}`);
  await writeFile(path.join(root, "SHA256SUMS.txt"), `${lines.join("\n")}\n`, "utf8");
}

await rm(browserResultsRoot, {recursive: true, force: true});
await mkdir(browserResultsRoot, {recursive: true});
const server = spawn(process.execPath, [path.join(packageRoot, "runner", "serve.mjs")], {cwd: packageRoot, stdio: ["ignore", "pipe", "pipe"]});
const serverErrors = [];
server.stderr.on("data", (chunk) => serverErrors.push(chunk.toString()));

let browser;
try {
  await waitForServer("http://127.0.0.1:4177/app/");
  browser = await chromium.launch({headless: true});
  const version = browser.version();
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1, locale: "es-AR", colorScheme: "light"});
  const page = await context.newPage();
  const networkRequests = [];
  const consoleErrors = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) networkRequests.push(request.url());
  });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto("http://127.0.0.1:4177/app/", {waitUntil: "networkidle"});
  const userAgent = await page.evaluate(() => navigator.userAgent);
  const cases = [];
  for (const testId of caseIds) cases.push(await runCase(page, testId, networkRequests, consoleErrors));
  await context.close();

  const passed = cases.filter(({status}) => status === "PASS").length;
  const summary = {
    schema_version: "oe-irp-f2-browser-summary-0.2",
    checkpoint: 26,
    wave: {id: "W1", name: "Transformación y recuperación"},
    browser: {engine: "Chromium", version, user_agent: userAgent, headless: true, viewport: "1440x1000", locale: "es-AR"},
    cases: cases.map(({test_id, status, checks}) => ({test_id, status, checks: checks.length})),
    totals: {planned: caseIds.length, passed, failed: caseIds.length - passed},
    browser_validation: passed === caseIds.length ? "PASS" : "FAIL",
    gate: passed === caseIds.length ? "PASS_W1_BROWSER" : "FAIL",
    wave_gate: passed === caseIds.length ? "STATE_HISTORY_UNDO_CONFORM" : "NONCONFORMITY",
    next_gate: passed === caseIds.length ? "ENABLE_F2_W2" : "REMEDIATE_AND_REPEAT_W1",
    external_network_requests: networkRequests.length,
    console_errors: consoleErrors.length,
    baselines_changed: false,
    main_changed: false,
    pages_changed: false,
    publication: "NOT_AUTHORIZED",
    limits: [
      "Valida estado, historia y recuperación técnica observable en Chromium; no certifica comprensión ni logro cognitivo.",
      "No habilita Ciclo 4 ni modifica baselines, main o GitHub Pages."
    ]
  };
  await writeJson(path.join(browserResultsRoot, "summary.json"), summary);
  await writeChecksums(browserResultsRoot);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = passed === caseIds.length ? 0 : 1;
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  if (serverErrors.length) process.stderr.write(serverErrors.join(""));
}
