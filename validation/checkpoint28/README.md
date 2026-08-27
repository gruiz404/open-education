# OE-001 · IRP-F2 · Checkpoint 28 · Ola W3

Paquete candidato aislado para validar en Chromium los tres contratos de **W3 · Revelación factual mínima**:

- `C2-T01`: explicar factual y exclusivamente qué cambió al agrupar;
- `C2-T11`: revelar sólo la dimensión D solicitada;
- `C3-T03`: revelar sólo la dimensión C sin confirmar ni refutar la hipótesis provisional.

## Gate

La ola sólo pasa si los 3/3 casos cumplen su allowlist y alcance exactos; las 57 comprobaciones del navegador pasan; la auditoría externa valida los 70 archivos cubiertos por checksum; no hay red externa ni errores de consola; y `main`, GitHub Pages y las baselines liberadas permanecen sin cambios.

Gate esperado: `PASS_W3_BROWSER` / `ALLOWLIST_EXACT_SCOPE_CONFORM`.

## Ejecución local

```bash
npm install --no-save playwright@1.55.0
npx playwright install chromium
npm test
npm run browser:test
npm run browser:audit
```

## Límites

Este paquete valida procedencia y alcance factual observable. No interpreta relevancia, recomienda acciones, confirma hipótesis ni certifica comprensión o logro. No habilita el Ciclo 4.
