# OE-001 · IRP-F2 · Checkpoint 26 · Ola W1

Paquete candidato aislado para validar en Chromium los ocho contratos de **W1 · Transformación y recuperación**:

- `C1-T01` ordenar y deshacer;
- `C1-T03` filtrar y restablecer (piloto centinela ya validado en CP25);
- `C1-T05` cambiar representación y volver a tabla;
- `C1-T07` restaurar agrupación original y volver por trayectoria;
- `C2-T04` restaurar vista anterior y rehacer;
- `C2-T10` cambiar de pregunta y recuperar una versión anterior;
- `C3-T08` reformular una relación y reactivar v1 sin borrar v2;
- `C3-T11` abandonar y reabrir una hipótesis provisional.

## Gate

La ola sólo pasa si los 8/8 casos cumplen estado, historia y recuperación; las 152 comprobaciones del navegador pasan; la auditoría externa valida los 185 archivos cubiertos por checksum; no hay red externa ni errores de consola; y `main`, GitHub Pages y las baselines liberadas permanecen sin cambios.

Gate esperado: `PASS_W1_BROWSER` / `STATE_HISTORY_UNDO_CONFORM`.

## Ejecución local

```bash
npm install --no-save playwright@1.55.0
npx playwright install chromium
npm test
npm run browser:test
npm run browser:audit
```

## Límites

Este paquete valida comportamiento técnico observable. No certifica comprensión, logro cognitivo ni validez de una versión publicada. No habilita el Ciclo 4.
