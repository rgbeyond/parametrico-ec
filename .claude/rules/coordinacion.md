# Coordinación multiagente — regla obligatoria

Este repositorio se trabaja coordinado con `rgbeyond/beyond-platform` y con validaciones externas que Claude Code no siempre puede ejecutar.

Antes de continuar después de trabajo externo:

1. sincroniza esta rama y `rgbeyond/beyond-platform` en su rama coordinada;
2. lee `beyond-platform/docs/operacion/protocolo-coordinacion-multiagente.md`;
3. lee la validación más reciente y los comentarios del issue activo que se te indiquen;
4. resume qué cambió respecto a tu contexto;
5. NO repitas cargas, migraciones ni cambios de infraestructura ya registrados como ejecutados salvo instrucción explícita.

Todo cambio de Claude debe quedar comiteado y empujado antes de devolver el control, con SHA, archivos, pruebas y riesgos. Todo cambio externo debe quedar registrado en GitHub antes de que Claude continúe.

Evita escrituras simultáneas sobre el mismo sistema. Beyond PROD, `main` y despliegues de producción requieren autorización explícita del usuario.

## Modo rápido seguro — ejecución por defecto

Para reducir tiempos sin bajar la calidad de seguridad:

- usa **un solo agente writer** para modificar código/SQL;
- lanza cuando sea útil **hasta 4 subagentes read-only en paralelo** (seguridad/RLS, integridad/migraciones PostgreSQL, compatibilidad de aplicación/API y pruebas adversariales);
- no esperes ociosamente a los reviewers: mientras corren, continúa trabajo independiente que no invalide su base de revisión;
- durante implementación corre primero **tests focalizados** sobre la superficie tocada;
- agrupa correcciones relacionadas antes de volver a lanzar suites completas;
- ejecuta reconstrucción completa + estado intermedio/TANDA1 como máximo en los hitos de integración: una vez antes de la revisión final y una vez después de corregir sus hallazgos, salvo que un fallo concreto justifique otra pasada;
- reserva **mutation testing** para controles de autorización nuevos, hallazgos HIGH/CRITICAL o pruebas cuya validez sea dudosa; no lo uses mecánicamente para cambios menores;
- corre al final todas las suites, guardias, referencias, PII y builds aplicables antes de comitear;
- si una sesión se vuelve pesada por contexto, prioriza una sesión nueva sobre la misma rama que lea los documentos canónicos y el issue activo, en vez de depender del historial conversacional completo.

La paralelización nunca autoriza escrituras concurrentes sobre el mismo archivo, rama, base o infraestructura.
