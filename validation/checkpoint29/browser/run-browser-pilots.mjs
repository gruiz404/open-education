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

function boundaryAbsent(content) {
  return content.cycle4_enabled === false
    && !content.mounted_components.includes("prediction_prompt")
    && content.prohibited_component_present === false
    && content.prompt_present === false
    && content.substitute_present === false
    && content.contrast_control_present === false
    && content.evaluation_control_present === false
    && content.promotion_performed === false
    && content.certification === "NONE"
    && !stableStringify(content).includes("prediction_prompt");
}

function stateContract(testId, phase, state) {
  const content = state.content;
  const spec = oracle.cases[testId];
  const common = state.checkpoint === 29
    && state.wave === "W4"
    && state.test_id === testId
    && state.phase === phase
    && state.state_hash_scope === "content"
    && content.active_cycle === spec.cycle
    && boundaryAbsent(content);
  if (!common) return {ok: false, detail: "Metadatos o frontera de estado no conformes"};
  if (phase === "before") {
    const ok = content.limit_recorded === false
      && content.blocked_mount_attempts === 0
      && content.mount_attempt_status === "PENDING_TECHNICAL_CHECK"
      && state.history_refs.length === 0;
    return {ok, detail: `cycle4=${content.cycle4_enabled}; attempts=${content.blocked_mount_attempts}; history=${state.history_refs.length}`};
  }
  if (phase === "after") {
    const ok = content.limit_recorded === true
      && content.blocked_mount_attempts === 1
      && content.mount_attempt_status === "BLOCKED"
      && state.history_refs.length === 3;
    return {ok, detail: `limit=${content.limit_recorded}; attempts=${content.blocked_mount_attempts}; mounted=${content.mounted_components.join(",")}`};
  }
  const ok = content.limit_recorded === true
    && content.blocked_mount_attempts === 1
    && content.mount_attempt_status === "BLOCKED"
    && state.history_refs.length === 3
    && state.technical_status === spec.recovery_contract;
  return {ok, detail: `recovery=${state.technical_status}; history=${state.history_refs.length}; active_cycle=${content.active_cycle}`};
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
  const actual = await page.evaluate(() => {
    const experience = document.querySelector("#experience");
    const text = experience?.textContent || "";
    return {
      test_id: experience?.getAttribute("data-test-id"),
      phase: experience?.getAttribute("data-phase"),
      scene_body_count: experience?.querySelectorAll("[data-scene-body]").length || 0,
      allowed_components: [...(experience?.querySelectorAll("[data-mounted-component]") || [])].map((node) => node.getAttribute("data-mounted-component")),
      prohibited_nodes: experience?.querySelectorAll('[data-prediction-prompt], [data-component="prediction_prompt"], form[data-cycle="4"], textarea[name*="predict"], input[name*="predict"], [data-contrast-control], [data-evaluation-control], [data-score], [data-certification], [data-promotion]').length || 0,
      forbidden_prompt_text: /(escribe|ingresa|formula).{0,30}(predic|pronóst)|qué.{0,20}(ocurrirá|pasará)|contrasta.{0,20}(predic|pronóst)/i.test(text),
      hypothesis_count: experience?.querySelectorAll('[data-hypothesis-status="PROVISIONAL"]').length || 0,
      heading: experience?.querySelector("#scene-title")?.textContent.trim(),
      primary_count: document.querySelectorAll('[data-action="primary"]').length,
      recovery_count: document.querySelectorAll('[data-action="recovery"]').length
    };
  });
  const ok = actual.test_id === testId
    && actual.phase === phase
    && actual.scene_body_count === 1
    && stableStringify(actual.allowed_components) === stableStringify(spec.allowed_components)
    && actual.prohibited_nodes === 0
    && actual.forbidden_prompt_text === false
    && actual.hypothesis_count === (testId === "C3-T04" ? 1 : 0)
    && actual.heading === spec.heading
    && actual.primary_count === (phase === "before" ? 1 : 0)
    && actual.recovery_count === (phase === "after" ? 1 : 0);
  return {ok, detail: stableStringify(actual)};
}

async function computedEvidence(page) {
  return page.evaluate(() => {
    const mounted = [...document.querySelectorAll("#experience [data-mounted-component]")].map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        component: element.getAttribute("data-mounted-component"),
        visible: rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none",
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    });
    const prohibitedNodeCount = document.querySelectorAll('#experience [data-prediction-prompt], #experience [data-component="prediction_prompt"], #experience form[data-cycle="4"], #experience textarea[name*="predict"], #experience input[name*="predict"], #experience [data-contrast-control], #experience [data-evaluation-control]').length;
    return {viewport: {width: innerWidth, height: innerHeight, device_pixel_ratio: devicePixelRatio}, mounted, prohibited_node_count: prohibitedNodeCount};
  });
}

async function capturePhase(page, testId, phase, pilotDir) {
  const state = await page.evaluate(() => window.IRPF2.stateEvidence());
  const contract = stateContract(testId, phase, state);
  const dom = await page.locator("#experience .experience-card").evaluate((element) => element.outerHTML);
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
  const ariaSnapshot = await page.locator("#workspace").ariaSnapshot();
  const computed = await computedEvidence(page);
  const fullPng = await page.screenshot({fullPage: true});
  const scenePng = await page.locator("#experience [data-scene-body]").screenshot();
  const full = pngInfo(fullPng);
  const scene = pngInfo(scenePng);
  const visibleAllowed = computed.mounted.filter(({visible}) => visible).length;

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
      pass(`${phase.toUpperCase()}_SCREENSHOTS_AND_VISIBILITY`, full.valid && scene.valid && visibleAllowed === spec.allowed_components.length && computed.prohibited_node_count === 0, `allowed_visible=${visibleAllowed}/${spec.allowed_components.length}; prohibited=${computed.prohibited_node_count}; full=${full.width}x${full.height}/${full.bytes} B; scene=${scene.width}x${scene.height}/${scene.bytes} B`)
    ],
    evidence: {state, computed, full, scene}
  };
}

function integrityCheck(testId, before, after, recovery) {
  const b = before.evidence.state.content;
  const a = after.evidence.state.content;
  const r = recovery.evidence.state.content;
  const spec = oracle.cases[testId];
  const common = [b, a, r].every((content) => boundaryAbsent(content)
    && content.active_cycle === spec.cycle
    && stableStringify(content.mounted_components) === stableStringify(spec.allowed_components))
    && stableStringify(b.records) === stableStringify(a.records)
    && stableStringify(b.records) === stableStringify(r.records)
    && a.limit_recorded === true
    && r.limit_recorded === true
    && a.blocked_mount_attempts === 1
    && r.blocked_mount_attempts === 1;
  if (testId === "C2-T09") {
    return {ok: common && a.forced_route === "NONE" && r.forced_route === "NONE", detail: "Ciclo 2 disponible, sin ruta forzada y sin componente prohibido"};
  }
  return {ok: common && a.hypothesis_status === "PROVISIONAL" && r.hypothesis_status === "PROVISIONAL" && a.hypothesis_confirmation === "NONE" && r.hypothesis_confirmation === "NONE", detail: "Ciclo 3 e hipótesis provisional preservados, sin promoción"};
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
  const prohibited = await page.locator('#experience [data-prediction-prompt], #experience [data-component="prediction_prompt"], #experience form[data-cycle="4"], #experience textarea[name*="predict"], #experience input[name*="predict"], #experience [data-contrast-control], #experience [data-evaluation-control], #experience [data-score], #experience [data-certification], #experience [data-promotion]').count();
  const recoveryVisual = before.evidence.scene.sha256 === recovery.evidence.scene.sha256;
  const checks = [
    ...before.checks,
    ...after.checks,
    ...recovery.checks,
    pass("EVENTS_MATCH_ORACLE", stableStringify(eventTypes) === stableStringify(oracle.cases[testId].events), eventTypes.join(" > ")),
    pass("EVENT_HISTORY_LINKS", history.length === events.length && new Set(history).size === history.length, `${history.length}/${events.length}`),
    pass("CYCLE4_BOUNDARY_STATE_INTEGRITY", integrity.ok, integrity.detail),
    pass("RECOVERY_VISUAL_AND_SEMANTIC", recoveryVisual && recovery.checks[0].status === "PASS", `before_scene=${before.evidence.scene.sha256}; recovery_scene=${recovery.evidence.scene.sha256}`),
    pass("PROHIBITED_COMPONENT_ABSENT", prohibited === 0, `prohibited_nodes=${prohibited}`),
    pass("EXTERNAL_NETWORK", networkRequests.length === networkStart, networkRequests.length === networkStart ? "0 solicitudes externas" : networkRequests.slice(networkStart).join("; ")),
    pass("CONSOLE_ERRORS", consoleErrors.length === consoleStart, consoleErrors.length === consoleStart ? "0 errores" : consoleErrors.slice(consoleStart).join("; "))
  ];
  const status = checks.every(({status: checkStatus}) => checkStatus === "PASS") ? "PASS" : "FAIL";
  const result = {schema_version: "oe-irp-f2-browser-case-0.5", checkpoint: 29, wave: "W4", test_id: testId, status, checks};
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
  await waitForServer("http://127.0.0.1:4180/app/");
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
  await page.goto("http://127.0.0.1:4180/app/", {waitUntil: "networkidle"});
  const userAgent = await page.evaluate(() => navigator.userAgent);
  const cases = [];
  for (const testId of caseIds) cases.push(await runCase(page, testId, networkRequests, consoleErrors));
  await context.close();
  const passed = cases.filter(({status}) => status === "PASS").length;
  const summary = {
    schema_version: "oe-irp-f2-browser-summary-0.5",
    checkpoint: 29,
    wave: {id: "W4", name: "Frontera del Ciclo 4"},
    browser: {engine: "Chromium", version, user_agent: userAgent, headless: true, viewport: "1440x1000", locale: "es-AR"},
    cases: cases.map(({test_id, status, checks}) => ({test_id, status, checks: checks.length})),
    totals: {planned: caseIds.length, passed, failed: caseIds.length - passed, browser_checks: cases.reduce((sum, item) => sum + item.checks.length, 0)},
    browser_validation: passed === caseIds.length ? "PASS" : "FAIL",
    gate: passed === caseIds.length ? "PASS_W4_BROWSER" : "FAIL",
    wave_gate: passed === caseIds.length ? "CYCLE4_COMPONENT_ABSENT_DOM_STATE" : "NONCONFORMITY",
    next_gate: passed === caseIds.length ? "ENABLE_F2_CONSOLIDATED_CLOSURE" : "REMEDIATE_AND_REPEAT_W4",
    external_network_requests: networkRequests.length,
    console_errors: consoleErrors.length,
    baselines_changed: false,
    main_changed: false,
    pages_changed: false,
    publication: "NOT_AUTHORIZED",
    limits: [
      "Valida en Chromium la ausencia del componente reservado al Ciclo 4 en el DOM y el estado de C2/C3.",
      "No habilita ni implementa Ciclo 4, no certifica comprensión o logro y no modifica baselines, main o GitHub Pages."
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
