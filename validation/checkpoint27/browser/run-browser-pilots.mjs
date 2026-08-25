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
const exactRecoveryIds = new Set(["C1-T06", "C2-T05"]);

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
  const common = state.checkpoint === 27 && state.wave === "W2" && state.test_id === testId && state.phase === phase && state.state_hash_scope === "content";
  if (!common) return {ok: false, detail: "Metadatos de estado no conformes"};

  if (phase === "before") {
    const ok = testId === "C2-T02"
      ? content.default_option === "view_B" && content.reader_choice === null && content.interaction_enabled === false && content.salience_violation === "DETECTED" && state.history_refs.length === 2
      : state.history_refs.length === 0;
    return {ok, detail: `initial=${state.state_hash}; history=${state.history_refs.length}`};
  }

  if (phase === "after") {
    let ok = false;
    if (testId === "C1-T06") ok = content.view_id === "view_B" && content.reader_choice === "view_B" && content.cognition_claim === "NONE";
    if (testId === "C1-T08") ok = content.comparison_open === true && content.observation?.provenance === "READER" && content.views.length === 2 && content.views_preserved === true;
    if (testId === "C2-T02") ok = content.default_option === null && content.reader_choice === null && content.interaction_enabled === true && content.salience_violation === "NEUTRALIZED";
    if (testId === "C2-T05") ok = content.grouping_id === "option_B" && content.reader_choice === "option_B" && content.cognition_claim === "NONE";
    if (testId === "C2-T06") ok = content.active_view_id === "view_grouped" && content.visibility_limit?.provenance === "READER" && content.return_option_exposed === true && content.snapshots.length === 2;
    if (testId === "C3-T06") ok = content.comparison_open === true && content.supporting_ids.length === 2 && content.contradicting_ids.length === 2 && content.confirmation === "NONE" && content.salience_audit === "PASS";
    return {ok, detail: `after_hash=${state.state_hash}; history=${state.history_refs.length}`};
  }

  let ok = false;
  if (exactRecoveryIds.has(testId)) ok = state.state_hash === initialHash;
  if (testId === "C1-T08") ok = content.comparison_open === false && content.observation?.provenance === "READER" && content.views.length === 2;
  if (testId === "C2-T02") ok = content.default_option === null && content.reader_choice === null && content.interaction_enabled === true && content.clean_snapshot === true;
  if (testId === "C2-T06") ok = content.active_view_id === "view_individual" && content.visibility_limit?.provenance === "READER" && content.snapshots.length === 2;
  if (testId === "C3-T06") ok = content.comparison_open === false && content.supporting_ids.length === 2 && content.contradicting_ids.length === 2 && content.confirmation === "NONE" && content.salience_audit === "PASS";
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
  const actual = await page.evaluate(() => ({
    test_id: document.querySelector("#experience")?.getAttribute("data-test-id"),
    phase: document.querySelector("#experience")?.getAttribute("data-phase"),
    scene_body_count: document.querySelectorAll("#experience [data-scene-body]").length,
    neutral_option_count: document.querySelectorAll("#experience [data-neutral-option]").length,
    default_option_count: document.querySelectorAll("#experience [data-default-option]").length,
    prohibited_nodes: document.querySelectorAll("#experience [data-score], #experience [data-recommendation], #experience [data-certification]").length,
    heading: document.querySelector("#scene-title")?.textContent.trim(),
    primary_count: document.querySelectorAll('#experience [data-action="primary"]').length,
    recovery_count: document.querySelectorAll('[data-action="recovery"]').length
  }));
  const expectedPrimary = phase === "before" && testId !== "C2-T02" ? 1 : 0;
  const expectedRecovery = phase === "after" ? 1 : 0;
  const expectedDefault = phase === "before" ? spec.visual.default_before : 0;
  const ok = actual.test_id === testId && actual.phase === phase && actual.scene_body_count === 1 && actual.neutral_option_count === 2 && actual.default_option_count === expectedDefault && actual.prohibited_nodes === 0 && actual.heading === spec.heading && actual.primary_count === expectedPrimary && actual.recovery_count === expectedRecovery;
  return {ok, detail: stableStringify(actual)};
}

async function computedEvidence(page) {
  return page.evaluate(() => {
    const styleOf = (element) => {
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
    const options = [...document.querySelectorAll("#experience [data-neutral-option]")].map(styleOf);
    const signature = (item) => JSON.stringify(item);
    return {
      viewport: {width: innerWidth, height: innerHeight, device_pixel_ratio: devicePixelRatio},
      neutral_options: {
        count: options.length,
        equivalent: options.length === 2 && options.every(({visible}) => visible) && signature(options[0]) === signature(options[1]),
        styles: options
      }
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
  const expectedEquivalent = spec.visual[`${phase}_equivalent`];
  const visualOk = fullInfo.valid && experienceInfo.valid && computed.neutral_options.equivalent === expectedEquivalent;

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
      pass(`${phase.toUpperCase()}_VISUAL_EQUIVALENCE_AND_SCREENSHOTS`, visualOk, `equivalent=${computed.neutral_options.equivalent}; expected=${expectedEquivalent}; full=${fullInfo.width}x${fullInfo.height}/${fullInfo.bytes} B; scene=${experienceInfo.width}x${experienceInfo.height}/${experienceInfo.bytes} B`)
    ],
    evidence: {state: actualState, computed, full: fullInfo, experience: experienceInfo}
  };
}

function integrityCheck(testId, before, after, recovery) {
  const b = before.evidence.state.content;
  const a = after.evidence.state.content;
  const r = recovery.evidence.state.content;
  if (testId === "C1-T06") return {ok: b.views.length === 2 && a.views.length === 2 && r.views.length === 2 && a.cognition_claim === "NONE" && r.cognition_claim === "NONE", detail: "Dos vistas y cognition_claim=NONE preservados"};
  if (testId === "C1-T08") return {ok: b.views.length === 2 && a.views.length === 2 && r.views.length === 2 && a.observation?.provenance === "READER" && r.observation?.provenance === "READER", detail: "Vistas y observación READER preservadas"};
  if (testId === "C2-T02") return {ok: b.reader_choice === null && a.reader_choice === null && r.reader_choice === null && a.default_option === null && r.default_option === null, detail: "Default eliminado sin fabricar elección"};
  if (testId === "C2-T05") return {ok: b.groupings.length === 2 && a.groupings.length === 2 && r.groupings.length === 2 && a.cognition_claim === "NONE" && r.cognition_claim === "NONE", detail: "Agrupaciones y cognition_claim=NONE preservados"};
  if (testId === "C2-T06") return {ok: stableStringify(b.snapshots) === stableStringify(a.snapshots) && stableStringify(b.snapshots) === stableStringify(r.snapshots) && a.visibility_limit?.provenance === "READER" && r.visibility_limit?.provenance === "READER", detail: "Snapshots y límite READER preservados"};
  return {ok: stableStringify(b.supporting_ids) === stableStringify(a.supporting_ids) && stableStringify(b.supporting_ids) === stableStringify(r.supporting_ids) && stableStringify(b.contradicting_ids) === stableStringify(a.contradicting_ids) && stableStringify(b.contradicting_ids) === stableStringify(r.contradicting_ids) && r.confirmation === "NONE", detail: "Conjuntos favorables/contradictorios preservados sin confirmación"};
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
    : recovery.checks[0].status === "PASS" && recovery.checks[3].status === "PASS";

  const checks = [
    ...before.checks,
    ...after.checks,
    ...recovery.checks,
    pass("EVENTS_MATCH_ORACLE", stableStringify(eventTypes) === stableStringify(expectedEvents), eventTypes.join(" > ")),
    pass("EVENT_HISTORY_LINKS", historyLinks.length === events.length && new Set(historyLinks).size === historyLinks.length, `${historyLinks.length}/${events.length}`),
    pass("NEUTRALITY_AND_STATE_INTEGRITY", integrity.ok, integrity.detail),
    pass("RECOVERY_VISUAL_OR_SEMANTIC", recoveryVisual, exactRecoveryIds.has(testId) ? `before=${before.evidence.experience.sha256}; recovery=${recovery.evidence.experience.sha256}` : oracle.cases[testId].recovery_contract),
    pass("PROHIBITED_UI_ABSENT", prohibited === 0, `prohibited_nodes=${prohibited}`),
    pass("EXTERNAL_NETWORK", networkRequests.length === networkStart, networkRequests.length === networkStart ? "0 solicitudes externas" : networkRequests.slice(networkStart).join("; ")),
    pass("CONSOLE_ERRORS", consoleErrors.length === consoleStart, consoleErrors.length === consoleStart ? "0 errores" : consoleErrors.slice(consoleStart).join("; "))
  ];
  const status = checks.every(({status: itemStatus}) => itemStatus === "PASS") ? "PASS" : "FAIL";
  const result = {schema_version: "oe-irp-f2-browser-case-0.3", checkpoint: 27, wave: "W2", test_id: testId, status, checks};
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
  await waitForServer("http://127.0.0.1:4178/app/");
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
  await page.goto("http://127.0.0.1:4178/app/", {waitUntil: "networkidle"});
  const userAgent = await page.evaluate(() => navigator.userAgent);
  const cases = [];
  for (const testId of caseIds) cases.push(await runCase(page, testId, networkRequests, consoleErrors));
  await context.close();

  const passed = cases.filter(({status}) => status === "PASS").length;
  const summary = {
    schema_version: "oe-irp-f2-browser-summary-0.3",
    checkpoint: 27,
    wave: {id: "W2", name: "Neutralidad y comparación"},
    browser: {engine: "Chromium", version, user_agent: userAgent, headless: true, viewport: "1440x1000", locale: "es-AR"},
    cases: cases.map(({test_id, status, checks}) => ({test_id, status, checks: checks.length})),
    totals: {planned: caseIds.length, passed, failed: caseIds.length - passed},
    browser_validation: passed === caseIds.length ? "PASS" : "FAIL",
    gate: passed === caseIds.length ? "PASS_W2_BROWSER" : "FAIL",
    wave_gate: passed === caseIds.length ? "VISUAL_EQUIVALENCE_NO_INDUCTION" : "NONCONFORMITY",
    next_gate: passed === caseIds.length ? "ENABLE_F2_W3" : "REMEDIATE_AND_REPEAT_W2",
    external_network_requests: networkRequests.length,
    console_errors: consoleErrors.length,
    baselines_changed: false,
    main_changed: false,
    pages_changed: false,
    publication: "NOT_AUTHORIZED",
    limits: [
      "Valida neutralidad y comparación técnica observable en Chromium; no certifica comprensión, preferencia ni logro cognitivo.",
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
