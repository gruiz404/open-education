import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdir, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserResultsRoot = path.join(packageRoot, "browser-results");
const pilotIds = ["C1-T03", "C2-T02", "C3-T04"];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stableStringify = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
};
const pass = (checkId, ok, detail) => ({check_id: checkId, status: ok ? "PASS" : "FAIL", detail});
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const writeJson = async (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
const golden = await readJson(path.join(packageRoot, "browser", "golden.json"));

function pngInfo(buffer) {
  const signature = buffer.subarray(0, 8).toString("hex");
  return {
    valid: signature === "89504e470d0a1a0a" && buffer.length > 5000,
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

async function actualAria(page, testId, phase) {
  const mainLocator = page.locator("#experience");
  const role = await mainLocator.evaluate((element) => element.getAttribute("role") || (element.tagName === "MAIN" ? "main" : "generic"));
  const main = {role, name: await mainLocator.getAttribute("aria-label"), phase: await mainLocator.getAttribute("data-phase"), children: []};
  if (testId === "C1-T03") {
    const group = page.getByRole("button", {name: "Grupo A", exact: true});
    const reset = page.getByRole("button", {name: "Restablecer", exact: true});
    main.children.push(
      {role: "heading", level: 2, name: await page.getByRole("heading", {level: 2, name: "Filtrar sin perder información"}).innerText()},
      {role: "button", name: "Grupo A", pressed: (await group.getAttribute("aria-pressed")) === "true"},
      {role: "button", name: "Restablecer", disabled: await reset.isDisabled()},
      {role: "table", name: await page.getByRole("table", {name: "Conjunto de observaciones"}).getAttribute("aria-label"), row_count: await page.locator("#experience tbody tr").count()}
    );
  } else if (testId === "C2-T02") {
    main.children.push({role: "heading", level: 2, name: await page.getByRole("heading", {level: 2, name: "Elegí una forma de observar"}).innerText()});
    for (const name of ["Vista A", "Vista B"]) {
      const option = page.getByRole("button", {name, exact: true});
      main.children.push({role: "button", name, pressed: (await option.getAttribute("aria-pressed")) === "true", disabled: await option.isDisabled()});
    }
  } else {
    main.children.push(
      {role: "heading", level: 2, name: await page.getByRole("heading", {level: 2, name: "Revisar las observaciones disponibles"}).innerText()},
      {role: "table", name: await page.getByRole("table", {name: "Conjunto de observaciones"}).getAttribute("aria-label"), row_count: await page.locator("#experience tbody tr").count()}
    );
  }
  return main;
}

async function canonicalDomComparison(page, goldenHtml) {
  return page.evaluate(({golden}) => {
    const normalize = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.replace(/\s+/g, " ").trim();
        return text ? {text} : null;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const booleanAttrs = new Set(["disabled", "checked", "selected", "readonly", "multiple", "required", "autofocus", "hidden"]);
      const attrs = [...node.attributes]
        .map((attr) => [attr.name, booleanAttrs.has(attr.name) ? true : attr.value])
        .sort(([a], [b]) => a.localeCompare(b));
      return {
        tag: node.tagName.toLowerCase(),
        attrs,
        children: [...node.childNodes].map(normalize).filter(Boolean)
      };
    };
    const template = document.createElement("template");
    template.innerHTML = golden.trim();
    const actual = document.querySelector("#experience .experience-card");
    return {
      actual: normalize(actual),
      expected: normalize(template.content.firstElementChild)
    };
  }, {golden: goldenHtml});
}

async function computedEvidence(page, testId) {
  return page.evaluate((id) => {
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
        opacity: style.opacity,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        visible: rect.width > 0 && rect.height > 0
      };
    };
    return {
      viewport: {width: innerWidth, height: innerHeight, device_pixel_ratio: devicePixelRatio},
      experience: styleOf("#experience .experience-card"),
      options: id === "C2-T02" ? [styleOf('[data-option-id="view_A"]'), styleOf('[data-option-id="view_B"]')] : []
    };
  }, testId);
}

async function capturePhase(page, testId, phase, pilotDir) {
  const expected = golden.pilots[testId];
  const stateName = phase === "before" ? "initial" : phase;
  const actualState = await page.evaluate(() => window.IRPF2.stateEvidence());
  const goldenState = expected.states[stateName];
  const actualDom = await page.locator("#experience .experience-card").evaluate((element) => element.outerHTML);
  const goldenDom = expected.dom[phase];
  const domComparison = await canonicalDomComparison(page, goldenDom);
  const actualAriaJson = await actualAria(page, testId, phase);
  const goldenAriaJson = expected.aria[phase];
  const ariaYaml = await page.locator("#experience").ariaSnapshot();
  const computed = await computedEvidence(page, testId);
  const fullPng = await page.screenshot({fullPage: true});
  const cardPng = await page.locator("#experience .experience-card").screenshot();
  const fullInfo = pngInfo(fullPng);
  const cardInfo = pngInfo(cardPng);

  await writeJson(path.join(pilotDir, `state_${phase}.json`), actualState);
  await writeFile(path.join(pilotDir, `dom_${phase}.html`), `${actualDom}\n`, "utf8");
  await writeJson(path.join(pilotDir, `aria_${phase}_actual.json`), actualAriaJson);
  await writeFile(path.join(pilotDir, `aria_${phase}_playwright.yml`), `${ariaYaml.trim()}\n`, "utf8");
  await writeJson(path.join(pilotDir, `computed_${phase}.json`), computed);
  await writeFile(path.join(pilotDir, "screenshots", `${phase}.png`), fullPng);
  await writeFile(path.join(pilotDir, "screenshots", `${phase}_experience.png`), cardPng);

  return {
    state: pass(`${phase.toUpperCase()}_STATE`, stableStringify(actualState) === stableStringify(goldenState), `hash=${actualState.state_hash}`),
    dom: pass(`${phase.toUpperCase()}_DOM`, stableStringify(domComparison.actual) === stableStringify(domComparison.expected), "DOM canónico coincide con Checkpoint 24"),
    aria: pass(`${phase.toUpperCase()}_ARIA`, stableStringify(actualAriaJson) === stableStringify(goldenAriaJson), "Roles, nombres y estados coinciden con Checkpoint 24"),
    screenshots: pass(`${phase.toUpperCase()}_SCREENSHOTS`, fullInfo.valid && cardInfo.valid, `full=${fullInfo.width}x${fullInfo.height}/${fullInfo.bytes} B; card=${cardInfo.width}x${cardInfo.height}/${cardInfo.bytes} B`),
    evidence: {state: actualState, computed, full: fullInfo, card: cardInfo}
  };
}

async function runPilot(page, testId, networkRequests, consoleErrors) {
  const pilotDir = path.join(browserResultsRoot, testId);
  await mkdir(path.join(pilotDir, "screenshots"), {recursive: true});
  await page.evaluate((id) => window.IRPF2.loadBefore(id), testId);
  const before = await capturePhase(page, testId, "before", pilotDir);

  if (testId === "C1-T03") await page.getByRole("button", {name: "Grupo A", exact: true}).click();
  else await page.evaluate(() => window.IRPF2.executePrimary());
  const after = await capturePhase(page, testId, "after", pilotDir);

  if (testId === "C1-T03") await page.getByRole("button", {name: "Restablecer", exact: true}).click();
  else if (testId === "C2-T02") await page.getByRole("button", {name: "Aplicar recuperación controlada", exact: true}).click();
  else await page.evaluate(() => window.IRPF2.executeRecovery());
  const recovery = await capturePhase(page, testId, "recovery", pilotDir);

  const actualEvents = await page.evaluate(() => window.IRPF2.run.events);
  const expectedEvents = golden.pilots[testId].events;
  await writeFile(path.join(pilotDir, "events.ndjson"), `${actualEvents.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");

  const checks = [
    before.state, before.dom, before.aria, before.screenshots,
    after.state, after.dom, after.aria, after.screenshots,
    recovery.state, recovery.dom, recovery.aria, recovery.screenshots,
    pass("EVENTS_MATCH", stableStringify(actualEvents) === stableStringify(expectedEvents), actualEvents.map((event) => event.event_type).join(" > ")),
    pass("EXTERNAL_NETWORK", networkRequests.length === 0, networkRequests.length ? networkRequests.join("; ") : "0 solicitudes externas"),
    pass("CONSOLE_ERRORS", consoleErrors.length === 0, consoleErrors.length ? consoleErrors.join("; ") : "0 errores")
  ];

  if (testId === "C1-T03") {
    checks.push(pass("C1_VISUAL_REVERSIBILITY", before.evidence.card.sha256 === recovery.evidence.card.sha256, `before=${before.evidence.card.sha256}; recovery=${recovery.evidence.card.sha256}`));
  } else if (testId === "C2-T02") {
    const [a, b] = recovery.evidence.computed.options;
    const equivalent = a && b && ["background_color", "border_color", "border_width", "font_weight", "opacity", "width", "height"].every((field) => a[field] === b[field]);
    checks.push(pass("C2_COMPUTED_EQUIVALENCE", equivalent, equivalent ? "Estilos y geometría equivalentes" : stableStringify({a, b})));
    checks.push(pass("C2_NO_VISUAL_PRESELECTION", recovery.evidence.state.content.reader_choice === null, "reader_choice=NONE"));
  } else {
    const cardHashes = [before, after, recovery].map((item) => item.evidence.card.sha256);
    const forbidden = await page.locator('[data-component="prediction"], [data-action="contrast"], [data-testid="evaluation-widget"]').count();
    checks.push(pass("C3_VISUAL_BOUNDARY", new Set(cardHashes).size === 1 && forbidden === 0, `experience_hash=${cardHashes[0]}; forbidden_nodes=${forbidden}`));
  }

  const status = checks.every((item) => item.status === "PASS") ? "PASS" : "FAIL";
  const result = {schema_version: "oe-irp-f2-browser-pilot-0.1", checkpoint: 25, test_id: testId, status, checks};
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
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) networkRequests.push(request.url());
  });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto("http://127.0.0.1:4177/app/", {waitUntil: "networkidle"});
  const userAgent = await page.evaluate(() => navigator.userAgent);
  const pilots = [];
  for (const testId of pilotIds) pilots.push(await runPilot(page, testId, networkRequests, consoleErrors));
  await context.close();

  const passed = pilots.filter((pilot) => pilot.status === "PASS").length;
  const summary = {
    schema_version: "oe-irp-f2-browser-summary-0.1",
    checkpoint: 25,
    browser: {engine: "Chromium", version, user_agent: userAgent, headless: true, viewport: "1440x1000", locale: "es-AR"},
    pilots: pilots.map(({test_id, status, checks}) => ({test_id, status, checks: checks.length})),
    totals: {planned: 3, passed, failed: 3 - passed},
    browser_validation: passed === 3 ? "PASS" : "FAIL",
    gate: passed === 3 ? "PASS_BROWSER_SENTINELS" : "FAIL",
    external_network_requests: networkRequests.length,
    console_errors: consoleErrors.length,
    baselines_changed: false,
    publication: "NOT_AUTHORIZED",
    limits: ["Valida comportamiento técnico observable en Chromium; no certifica comprensión ni logro cognitivo.", "No habilita Ciclo 4 ni modifica baselines liberadas."]
  };
  await writeJson(path.join(browserResultsRoot, "summary.json"), summary);
  await writeChecksums(browserResultsRoot);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = passed === 3 ? 0 : 1;
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  if (serverErrors.length) process.stderr.write(serverErrors.join(""));
}
