import {getFixture} from "../fixtures/catalog.mjs";
import {createRun, executePrimary, executeRecovery, exportState, hashContent} from "../src/core.mjs";
import {renderShellHtml} from "../src/render.mjs";

const workspace = document.querySelector("#workspace");
const selector = document.querySelector("#scenario");
const reset = document.querySelector("#reset");
let run;

function paint() {
  workspace.innerHTML = renderShellHtml(run);
  workspace.querySelector('[data-action="filter-a"]')?.addEventListener("click", async () => {
    await executePrimary(run);
    paint();
  });
  workspace.querySelector('[data-action="clear-filter"]')?.addEventListener("click", async () => {
    await executeRecovery(run);
    paint();
  });
  workspace.querySelector('[data-action="technical-recovery"]')?.addEventListener("click", async () => {
    await executeRecovery(run);
    paint();
  });
}

async function load(testId, {autoPrimary = true} = {}) {
  selector.value = testId;
  run = await createRun(getFixture(testId));
  paint();
  if (autoPrimary && (testId === "C2-T02" || testId === "C3-T04")) {
    await executePrimary(run);
    paint();
  }
}

selector.addEventListener("change", () => load(selector.value));
reset.addEventListener("click", () => load(selector.value));
await load(selector.value);

window.IRPF2 = {
  get run() { return run; },
  load,
  loadBefore: (testId) => load(testId, {autoPrimary: false}),
  executePrimary: async () => { await executePrimary(run); paint(); },
  executeRecovery: async () => { await executeRecovery(run); paint(); },
  exportState: () => exportState(run),
  stateEvidence: async () => ({
    ...exportState(run),
    state_hash_scope: "content",
    state_hash: await hashContent(run.content)
  })
};
