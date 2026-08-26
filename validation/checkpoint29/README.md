# OE-001 · IRP-F2 · Checkpoint 29 · Ola W4

Paquete candidato aislado para validar en Chromium los dos contratos de **W4 · Frontera del Ciclo 4**:

- `C2-T09`: bloquear una consigna de predicción no autorizada y continuar en Ciclo 2 sin ruta forzada;
- `C3-T04`: bloquear la misma clase de componente y conservar la hipótesis provisional en Ciclo 3 sin promoción.

## Gate

La ola sólo pasa si los 2/2 casos mantienen ausente el componente prohibido en el DOM y el estado; las 38 comprobaciones del navegador pasan; la auditoría externa valida los 47 archivos cubiertos por checksum; no hay red externa ni errores de consola; y `main`, GitHub Pages y las baselines liberadas permanecen sin cambios.

Gate esperado: `PASS_W4_BROWSER` / `CYCLE4_COMPONENT_ABSENT_DOM_STATE`.

## Ejecución local

```bash
npm install --no-save playwright@1.55.0
npx playwright install chromium
npm test
npm run browser:test
npm run browser:audit
```

## Límites

Este paquete valida la frontera técnica de los Ciclos 2 y 3. No habilita ni implementa el Ciclo 4, no certifica comprensión o logro y no autoriza publicación. Un PASS habilita únicamente la revisión consolidada de cierre de las 19 pruebas F2.
