# OE-001 · IRP-F2 navegador C25 v0.1 CANDIDATO

Esqueleto local e instrumentado definido en el Checkpoint 23 y materializado en el Checkpoint 24. Ejecuta los pilotos centinela C1-T03, C2-T02 y C3-T04 sin conectarse a producción ni modificar GitHub, OE-001 público, B1 v0.3.13 o B2 v0.1 RELEASED.

## Separación de responsabilidades

- `src/core.mjs`: estado determinista, decisiones de política y eventos append-only.
- `src/render.mjs`: representación semántica compartida por la interfaz y el ejecutor.
- `app/`: interfaz local de inspección manual; no conoce el oráculo.
- `runner/`: ejecuta fixtures fijos y materializa evidencia.
- `auditor/`: proceso externo que compara el bundle con el contrato y decide PASS/FAIL.
- `results/`: bundles producidos por corrida y resúmenes verificables.

La huella de estado se calcula únicamente sobre `content`. La trayectoria queda fuera de esa huella y se conserva de forma append-only en `events.ndjson`; por eso una reversión puede recuperar el hash inicial sin borrar el historial.

## Ejecución

```bash
npm test
npm run run:pilots
npm run verify
```

La interfaz puede inspeccionarse con `npm run serve` y abriendo `http://127.0.0.1:4177/app/`. El servidor sólo escucha en loopback.

## Validación Chromium del Checkpoint 25

El directorio `browser/` ejecuta los mismos tres pilotos centinela en Chromium real. La aplicación expone una interfaz de prueba limitada (`loadBefore`, `stateEvidence`) que reutiliza el mismo núcleo y el mismo renderizador; el oráculo permanece fuera de la aplicación.

La corrida de navegador contrasta cada fase con la evidencia determinista del Checkpoint 24:

- estado y huella de contenido;
- DOM canónico de la experiencia;
- nombres, roles y estados ARIA observados por Playwright;
- capturas completas y recortes de la experiencia;
- secuencia de eventos, aislamiento de red y errores de consola.

```bash
npm install --no-save playwright@1.55.0
npx playwright install chromium
npm run browser:test
npm run browser:audit
```

El workflow `checkpoint25-chromium.yml` está preparado para ejecución manual en una rama aislada. No modifica `main`, GitHub Pages, B1 v0.3.13 ni B2 v0.1 RELEASED.

## Límite del Checkpoint 24

La corrida automática usa el mismo núcleo y el mismo renderizador semántico de la interfaz, con capturas PNG generadas por un renderizador determinista. El ejecutable Chromium no estuvo disponible en el entorno de cierre; por ello el resultado se declara **PASS TÉCNICO CONTROLADO** y la validación en navegador real permanece como gate posterior. No se emite certificación de comprensión, logro cognitivo ni validez del sistema publicado.
