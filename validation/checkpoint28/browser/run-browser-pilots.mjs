import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdir, readFile, readdir, rm, stat, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resultsRoot = path.join(packageRoot, "browser-results");
const oracle = JSON.parse(await readFile(path.join(packageRoot, "browser", "contract-oracle.json"), "utf8"));
const caseIds = Object.keys(oracle.cases);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stableStringify = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
};
const pass = (checkId, ok, detail) => ({check_id: checkId, status: ok ? "PASS" : "FAIL", detail});
const writeJson = async (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");

function pngInfo(buffer) {
  return {
    valid: buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" && buffer.length > 4000,
    bytes: buffer.length,
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    sha256: sha256(buffer)
  };
}

async function waitForServer(url, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Servidor no disponible después de ${timeoutMs} ms`);
}

function stateContract(testId, phase, state) {
  const content = state.content;
  const common = state.checkpoint === 28 && state.wave === "W3" && state.test_id === testId && state.phase === phase && state.state_hash_scope === "content";
  if (!common) return {ok: false, detail: "Metadatos de estado no conformes"};
  if (phase === "before") {
    const ok = content.disclosure_open === false && content.requested_field == null && content.revealed_fields.length === 0 && state.history_refs.length === 0;
    return {ok, detail: `disclosure=${content.disclosure_open}; revealed=${content.revealed_fields.length}; history=${state.history_refs.length}`};
  }
  if (phase === "after") {
    const spec = oracle.cases[testId];
    let ok = content.disclosure_open === true && content.requested_field === spec.requested_field && stableStringify(content.revealed_fields) === stableStringify(spec.allowed_fields) && content.disclosure_provenance && content.disclosure_scope && content.interpretation === "NONE" && content.recommendation === "NONE";
    if (testId === "C2-T01") ok = ok && content.factual_disclosure_count === 1 && content.relation_claim === "NONE";
    if (testId === "C3-T03") ok = ok && content.hypothesis_status === "PROVISIONAL" && content.hypothesis_confirmation === "NONE";
    return {ok: Boolean(ok), detail: `requested=${content.requested_field}; revealed=${content.revealed_fields.join(",")}; scope=${content.disclosure_scope}`};
  }
  let ok = content.disclosure_open === false && content.requested_field == null && content.revealed_fields.length === 0 && content.disclosure_provenance == null && content.disclosure_scope == null;
  if (testId === "C2-T01") ok = ok && content.factual_disclosure_count === 1;
  if (testId === "C3-T03") ok = ok && content.hypothesis_status === "PROVISIONAL" && content.hypothesis_confirmation === "NONE";
  return {ok, detail: `recovery=${oracle.cases[testId].recovery_contract}; history=${state.history_refs.length}`};
}

async function ariaEvidence(page, testId, phase) {
  const spec = oracle.cases[testId];
  const main = page.locator("#experience");
  return {
    role: await main.evaluate((element) => element.tagName.toLowerCase() === "main" ? "main" : "generic"),
    name: await main.getAttribute("aria-label"),
    phase: await main.getAttribute("data-phase"),
    heading: await page.getByRole("heading", {level: 2, name: spec.heading, exact: true}).innerText(),
    primary_action_present: await page.getByRole("button", {name: spec.primary_action, exact: true}).count() === 1,
    recovery_action_present: await page.getByRole("button", {name: spec.recovery_action, exact: true}).count() === 1
  };
}

async function domCheck(page, testId, phase) {
  const spec = oracle.cases[testId];
  const actual = await page.evaluate(() => ({
    test_id: document.querySelector("#experience")?.getAttribute("data-test-id"),
    phase: document.querySelector("#experience")?.getAttribute("data-phase"),
    scene_body_count: document.querySelectorAll("#experience [data-scene-body]").length,
    revealed_fields: [...document.querySelectorAll("#experience [data-revealed-field]")].map((node) => node.getAttribute("data-revealed-field")),
    provenance_count: document.querySelectorAll("#experience [data-provenance]").length,
    hypothesis_count: document.querySelectorAll("#experience [data-hypothesis-status=\"PROVISIONAL\"]").length,
    prohibited_nodes: document.querySelectorAll("#experience [data-score], #experience [data-recommendation], #experience [data-certification], #experience [data-confirmation]").length,
    heading: document.querySelector("#scene-title")?.textContent.trim(),
    primary_count: document.querySelectorAll('#experience [data-action="primary"]').length,
    recovery_count: document.querySelectorAll('[data-action="recovery"]').length
  }));
  const expectedFields = phase === "after" ? spec.allowed_fields : [];
  const ok = actual.test_id === testId && actual.phase === phase && actual.scene_body_count === 1 && stableStringify(actual.revealed_fields) === stableStringify(expectedFields) && actual.provenance_count === (phase === "after" ? 1 : 0) && actual.hypothesis_count === (testId === "C3-T03" ? 1 : 0) && actual.prohibited_nodes === 0 && actual.heading === spec.heading && actual.primary_count === (phase === "before" ? 1 : 0) && actual.recovery_count === (phase === "after" ? 1 : 0);
  return {ok, detail: stableStringify(actual)};
}

async function computedEvidence(page) {
  return page.evaluate(() => {
    const revealed = [...document.querySelectorAll("#experience [data-revealed-field]")].map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {field: element.getAttribute("data-revealed-field"), visible: rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none", width: Math.round(rect.width), height: Math.round(rect.height)};
    });
    return {viewport: {width: innerWidth, height: innerHeight, device_pixel_ratio: devicePixelRatio}, revealed};
  });
}

async function capturePhase(page, testId, phase, pilotDir) {
  const state = await page.evaluate(() => window.IRPF2.stateEvidence());
  const contract = stateContract(testId, phase, state);
  const dom = await page.locator("#experience .experience-card").evaluate((element) => element.outerHTML);
  const domContract = await domCheck(page, testId, phase);
  const aria = await ariaEvidence(page, testId, phase);
  const spec = oracle.cases[testId];
  const expectedAria = {role: "main", name: `Experiencia ${testId}`, phase, heading: spec.heading, primary_action_present: phase === "before", recovery_action_present: phase === "after"};
  const ariaSnapshot = await page.locator("#workspace").ariaSnapshot();
  const computed = await computedEvidence(page);
  const fullPng = await page.screenshot({fullPage: true});
  const scenePng = await page.locator("#experience [data-scene-body]").screenshot();
  const full = pngInfo(fullPng);
  const scene = pngInfo(scenePng);
  const visibleFacts = computed.revealed.filter(({visible}) => visible).length;
  const expectedFacts = phase === "after" ? spec.allowed_fields.length : 0;

  await writeJson(path.join(pilotDir, `state_${phase}.json`), state);
  await writeFile(path.join(pilotDir, `dom_${phase}.html`), `${dom}\n`, "utf8");
  await writeJson(path.join(pilotDir, `aria_${phase}_actual.json`), aria);
  await writeFile(path.join(pilotDir, `aria_${phase}_playwright.yml`), `${ariaSnapshot.trim()}\n`, "utf8");
  await writeJson(path.join(pilotDir, `computed_${phase}.json`), computed);
  await writeFile(path.join(pilotDir, "screenshots", `${phase}.png`), fullPng);
  await writeFile(path.join(pilotDir, "screenshots", `${phase}_experience.png`), scenePng);

  return {
    checks: [
      pass(`${phase.toUpperCase()}_STATE_CONTRACT`, contract.ok, contract.detail),
      pass(`${phase.toUpperCase()}_DOM_STRUCTURE`, domContract.ok, domContract.detail),
      pass(`${phase.toUpperCase()}_ARIA`, stableStringify(aria) === stableStringify(expectedAria), stableStringify(aria)),
      pass(`${phase.toUpperCase()}_SCREENSHOTS_AND_VISIBILITY`, full.valid && scene.valid && visibleFacts === expectedFacts, `visible_facts=${visibleFacts}/${expectedFacts}; full=${full.width}x${full.height}/${full.bytes} B; scene=${scene.width}x${scene.height}/${scene.bytes} B`)
    ],
    evidence: {state, computed, full, scene}
  };
}

function integrityCheck(testId, before, after, recovery) {
  const b = before.evidence.state.content;
  const a = after.evidence.state.content;
  const r = recovery.evidence.state.content;
  const spec = oracle.cases[testId];
  const common = stableStringify(b.allowlist) === stableStringify(spec.allowed_fields) && stableStringify(a.allowlist) === stableStringify(spec.allowed_fields) && stableStringify(r.allowlist) === stableStringify(spec.allowed_fields) && stableStringify(a.revealed_fields) === stableStringify(spec.allowed_fields) && r.revealed_fields.length === 0 && stableStringify(b.records) === stableStringify(a.records) && stableStringify(b.records) === stableStringify(r.records);
  if (testId === "C2-T01") return {ok: common && a.relation_claim === "NONE" && a.factual_disclosure_count === 1 && r.factual_disclosure_count === 1, detail: "Clave, pertenencia y elementos preservados; sin relación inferida"};
  if (testId === "C2-T11") return {ok: common && !a.revealed_fields.includes("dimension_C") && !a.revealed_fields.includes("dimension_E"), detail: "Sólo dimensión_D; C/E permanecen ocultas"};
  return {ok: common && !a.revealed_fields.includes("dimension_B") && !a.revealed_fields.includes("dimension_D") && a.hypothesis_status === "PROVISIONAL" && r.hypothesis_status === "PROVISIONAL" && r.hypothesis_confirmation === "NONE", detail: "Sólo dimensión_C; hipótesis provisional preservada"};
}

async function runCase(page, testId, networkRequests, consoleErrors) {
  const pilotDir = path.join(resultsRoot, testId);
  await mkdir(path.join(pilotDir, "screenshots"), {recursive: true});
  const networkStart = networkRequests.length;
  const consoleStart = consoleErrors.length;
  await page.evaluate((id) => window.IRPF2.loadBefore(id), testId);
  const before = await capturePhase(page, testId, "before", pilotDir);
  await page.getByRole("button", {name: oracle.cases[testId].primary_action, exact: true}).click();
  await page.waitForFunction(() => document.querySelector("#experience")?.dataset.phase === "after");
  const after = await capturePhase(page, testId, "after", pilotDir);
  await page.getByRole("button", {name: oracle.cases[testId].recovery_action, exact: true}).click();
  await page.waitForFunction(() => document.querySelector("#experience")?.dataset.phase === "recovery");
  const recovery = await capturePhase(page, testId, "recovery", pilotDir);

  const events = await page.evaluate(() => window.IRPF2.run.events);
  const eventTypes = events.map(({event_type}) => event_type);
  await writeFile(path.join(pilotDir, "events.ndjson"), `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
  const integrity = integrityCheck(testId, before, after, recovery);
  const history = recovery.evidence.state.history_refs;
  const prohibited = await page.locator("#experience [data-score], #experience [data-recommendation], #experience [data-certification], #experience [data-confirmation]").count();
  const recoveryVisual = before.evidence.scene.sha256 === recovery.evidence.scene.sha256;
  const checks = [
    ...before.checks, ...after.checks, ...recovery.checks,
    pass("EVENTS_MATCH_ORACLE", stableStringify(eventTypes) === stableStringify(oracle.cases[testId].events), eventTypes.join(" > ")),
    pass("EVENT_HISTORY_LINKS", history.length === events.length && new Set(history).size === history.length, `${history.length}/${events.length}`),
    pass("ALLOWLIST_AND_STATE_INTEGRITY", integrity.ok, integrity.detail),
    pass("RECOVERY_VISUAL_AND_SEMANTIC", recoveryVisual && recovery.checks[0].status === "PASS", `before_scene=${before.evidence.scene.sha256}; recovery_scene=${recovery.evidence.scene.sha256}`),
    pass("PROHIBITED_UI_ABSENT", prohibited === 0, `prohibited_nodes=${prohibited}`),
    pass("EXTERNAL_NETWORK", networkRequests.length === networkStart, networkRequests.length === networkStart ? "0 solicitudes externas" : networkRequests.slice(networkStart).join("; ")),
    pass("CONSOLE_ERRORS", consoleErrors.length === consoleStart, consoleErrors.length === consoleStart ? "0 errores" : consoleErrors.slice(consoleStart).join("; "))
  ];
  const status = checks.every(({status: checkStatus}) => checkStatus === "PASS") ? "PASS" : "FAIL";
  const result = {schema_version: "oe-irp-f2-browser-case-0.4", checkpoint: 28, wave: "W3", test_id: testId, status, checks};
  await writeJson(path.join(pilotDir, "checks.json"), result);
  return result;
}

async function writeChecksums(root) {
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

await rm(resultsRoot, {recursive: true, force: true});
await mkdir(resultsRoot, {recursive: true});
const server = spawn(process.execPath, [path.join(packageRoot, "runner", "serve.mjs")], {cwd: packageRoot, stdio: ["ignore", "pipe", "pipe"]});
const serverErrors = [];
server.stderr.on("data", (chunk) => serverErrors.push(chunk.toString()));
let browser;
try {
  await waitForServer("http://127.0.0.1:4179/app/");
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
  await page.goto("http://127.0.0.1:4179/app/", {waitUntil: "networkidle"});
  const userAgent = await page.evaluate(() => navigator.userAgent);
  const cases = [];
  for (const testId of caseIds) cases.push(await runCase(page, testId, networkRequests, consoleErrors));
  await context.close();
  const passed = cases.filter(({status}) => status === "PASS").length;
  const summary = {
    schema_version: "oe-irp-f2-browser-summary-0.4", checkpoint: 28,
    wave: {id: "W3", name: "Revelación factual mínima"},
    browser: {engine: "Chromium", version, user_agent: userAgent, headless: true, viewport: "1440x1000", locale: "es-AR"},
    cases: cases.map(({test_id, status, checks}) => ({test_id, status, checks: checks.length})),
    totals: {planned: caseIds.length, passed, failed: caseIds.length - passed, browser_checks: cases.reduce((sum, item) => sum + item.checks.length, 0)},
    browser_validation: passed === caseIds.length ? "PASS" : "FAIL",
    gate: passed === caseIds.length ? "PASS_W3_BROWSER" : "FAIL",
    wave_gate: passed === caseIds.length ? "ALLOWLIST_EXACT_SCOPE_CONFORM" : "NONCONFORMITY",
    next_gate: passed === caseIds.length ? "ENABLE_F2_W4" : "REMEDIATE_AND_REPEAT_W3",
    external_network_requests: networkRequests.length, console_errors: consoleErrors.length,
    baselines_changed: false, main_changed: false, pages_changed: false, publication: "NOT_AUTHORIZED",
    limits: [
      "Valida procedencia y alcance factual observable en Chromium; no interpreta relevancia, recomienda acciones ni confirma hipótesis.",
      "No certifica comprensión o logro, no habilita Ciclo 4 y no modifica baselines, main o GitHub Pages."
    ]
  };
  await writeJson(path.join(resultsRoot, "summary.json"), summary);
  await writeChecksums(resultsRoot);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = passed === caseIds.length ? 0 : 1;
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  if (serverErrors.length) process.stderr.write(serverErrors.join(""));
}
