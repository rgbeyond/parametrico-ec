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
