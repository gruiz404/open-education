# OE-001 · IRP-F2 · Checkpoint 30 · Cierre consolidado

Paquete candidato aislado para auditar el cierre de las **19 pruebas F2** ejecutadas en cuatro olas:

- W1 · Transformación y recuperación: 8 casos;
- W2 · Neutralidad y comparación: 6 casos;
- W3 · Revelación factual mínima: 3 casos;
- W4 · Frontera del Ciclo 4: 2 casos.

## Alcance

El cierre no vuelve a interpretar las respuestas del lector ni reemplaza las validaciones Chromium ya realizadas. Recupera los cuatro artefactos oficiales de GitHub Actions, verifica sus digests, manifiestos internos, resúmenes, auditorías, casos, gates y protecciones, y comprueba que los 19 contratos aparecen exactamente una vez.

## Gate

La Fase 2 sólo cierra si:

- los cuatro workflows oficiales concluyeron correctamente;
- los cuatro artefactos coinciden con sus digests SHA-256;
- los manifiestos internos verifican 441/441 archivos;
- los 19/19 casos y 361/361 controles Chromium están aprobados;
- las 65/65 comprobaciones de auditoría de ola están aprobadas;
- la cadena de gates W1 > W2 > W3 > W4 > cierre es coherente;
- `main`, GitHub Pages y las baselines liberadas permanecen sin cambios;
- no hay red externa ni errores de consola en las ejecuciones Chromium.

Gate esperado: `PASS_F2_CONSOLIDATED_CLOSURE`.

Criterio: `F2_19_CASES_4_WAVES_TRACEABLE_CONFORM`.

## Límites

Este checkpoint cierra F2 como candidato técnico auditable. No certifica comprensión o logro cognitivo, no habilita ni implementa el Ciclo 4, no autoriza publicación y no incorpora ramas a `main`. El paso siguiente queda sujeto a una decisión explícita de alcance posterior a F2.
