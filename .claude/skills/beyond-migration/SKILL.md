---
description: Gestiona cualquier necesidad de migración detectada desde el Paramétrico sin convertir este repo en fuente de verdad del Core.
---
# Beyond migration
Toda migración canónica vive en `beyond-platform`. No reapliques SQL histórico de este repo para compensar el Core. Documenta necesidad, prepara/revisa migración NUEVA en la rama coordinada del backend, reconstruye arnés, revisa seguridad/DB y sólo luego aplica DEV con autorización. PROD requiere autorización explícita separada.