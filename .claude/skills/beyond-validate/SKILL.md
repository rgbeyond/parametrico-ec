---
description: Valida cambios del Paramétrico EC antes de commit/handoff.
---
# Beyond validate — Paramétrico EC
1. Revisa diff. 2. Tests focalizados. 3. Hito final: `npm test` y `npm run build`. 4. Si cambia catálogo/Core, valida la integración canónica disponible y declara cualquier omisión. 5. Para UI/rutas usa frontend + adversarial; para auth/RLS añade seguridad/DB. 6. Corrige sólo hallazgos >=80% dentro de alcance y repite pruebas afectadas. 7. Entrega SHA, pruebas, reviewers, omisiones y E2E pendiente.