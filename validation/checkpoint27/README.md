# OE-001 · IRP-F2 · Checkpoint 27 · Ola W2

Paquete candidato aislado para validar en Chromium los seis contratos de **W2 · Neutralidad y comparación**:

- `C1-T06` elegir una vista sin inferir comprensión;
- `C1-T08` comparar dos vistas y conservar la observación del lector;
- `C2-T02` detectar un default inyectado, bloquear y neutralizar (centinela W2);
- `C2-T05` elegir una agrupación neutral y reversible;
- `C2-T06` registrar un límite de visibilidad y conservar el retorno;
- `C3-T06` yuxtaponer casos favorables y contradictorios con igual saliencia.

## Gate

La ola sólo pasa si los 6/6 casos cumplen equivalencia visual y ausencia de inducción; las 114 comprobaciones del navegador pasan; la auditoría externa valida los 139 archivos cubiertos por checksum; no hay red externa ni errores de consola; y `main`, GitHub Pages y las baselines liberadas permanecen sin cambios.

Gate esperado: `PASS_W2_BROWSER` / `VISUAL_EQUIVALENCE_NO_INDUCTION`.

## Ejecución local

```bash
npm install --no-save playwright@1.55.0
npx playwright install chromium
npm test
npm run browser:test
npm run browser:audit
```

## Límites

Este paquete valida comportamiento técnico y neutralidad visual observable. No certifica comprensión, preferencia del lector, logro cognitivo ni validez de una versión publicada. No habilita el Ciclo 4.
