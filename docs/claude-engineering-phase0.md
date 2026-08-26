# Fase 0 — Capa de ingeniería de Claude Code (paramétrico)

**Fecha:** 2026-08-26 · **Rama:** `claude/phase0-engineering-layer` · **Alcance:**
configuración. **Cero cambios de comportamiento de ejecución.**

El informe completo de la fase, con la tabla de trazabilidad de los dos
repositorios, vive en el portafolio:
`propuestas-fv/docs/claude-engineering-phase0.md`. Aquí queda lo propio de este
repositorio.

---

## Qué cambió aquí

| | Antes | Después |
|---|---:|---:|
| `CLAUDE.md` | 352 L · 19,495 B | **148 L · 6,110 B** (−69%) |

**Creado:**

```
.claude/
├── settings.json                     permisos y hooks
├── rules/
│   ├── motor-ec.md                   src/lib/app.js, datos.js, catalogo.json
│   ├── supabase.md                   supabase/**, sesion.js, supabase.js
│   └── ui.md                         src/ui/**, src/styles/**, index.html
├── agents/
│   ├── code-critic.md                revisor de solo lectura
│   └── normative-researcher.md       investigación regulatoria
└── hooks/
    ├── guardia-secretos.sh           PreToolUse Edit|Write
    ├── guardia-destructivo.py        PreToolUse Bash
    ├── verifica-por-ruta.sh          PostToolUse Edit|Write
    └── probar-guardias.py            suite de los guardias, 35 casos
```

**Conservado sin tocar:** `.claude/launch.json`. Es configuración de depuración
de VS Code con una ruta de Windows, ajena a Claude Code, y no hay `.vscode/` en
el repositorio. Parece sin uso, pero eso no lo prueba: puede servir en otra
máquina. **Requiere confirmación humana antes de retirarlo.**

## Dónde quedó cada instrucción

| Guía original | Nueva ubicación |
|---|---|
| NOM-001-SEDE-2012, criterio del 125% | `rules/motor-ec.md` |
| Transformador contra demanda de diseño, `FP_DIM` 0.80 | `rules/motor-ec.md` |
| Reserva de balanceo y su dependencia de `GE-001` | `rules/motor-ec.md` |
| Balance en kVA, tensiones declaradas | `rules/motor-ec.md` |
| Depósito de garantía sobre demanda contratada | `rules/motor-ec.md` |
| Piso de demanda contratada | `rules/motor-ec.md` |
| Cobro medido contra calculado | `rules/motor-ec.md` |
| Motor de cantidades pendiente de validar | `rules/motor-ec.md` |
| Citas regulatorias sin verificar, con su advertencia | `rules/motor-ec.md` |
| Quién actualiza precios del maestro | `rules/supabase.md` |
| `conceptos.ambitos` y el catálogo compartido | `rules/supabase.md` |
| Validación de SQL y el error 55P04 del enum | `rules/supabase.md` |
| Carga diferida de `app.js` | `rules/ui.md` |
| La llave de datos `grupos` no se renombra | `rules/ui.md` |
| Versión, bitácora y pie del documento | `rules/ui.md` |
| Tabla de roles | **CLAUDE.md** — se consulta en casi toda sesión |
| Caso Atlacomulco | **CLAUDE.md**, condensado |
| «Supabase en proceso de configuración» | **Eliminado: obsoleto** |
| Estado del catálogo con conteos | **Eliminado del contexto** |

## Particularidades de este repositorio

**No tiene pruebas automatizadas.** Es su mayor hueco y condiciona todo lo
demás:

- El hook `verifica-por-ruta.sh` no puede correr ninguna. Lo único honesto que
  hace es nombrar la compuerta real de cada tipo de archivo. Cuando existan
  pruebas, ahí se conectan.
- El `code-critic` de este repositorio lleva un invariante extra: revisar
  sabiendo que un cambio en `app.js` **no tiene red**.
- `settings.json` no incluye `npm test` en `allow` porque no existe.

**`src/lib/app.js` son 1,076 líneas sin pruebas.** El CLAUDE.md original ya
pedía dividirlo. El orden correcto es pruebas primero, y el caso Atlacomulco es
el candidato natural a prueba dorada: entradas conocidas, salidas conocidas.

## Nota sobre la rama

Esta rama salió de `claude/solar-proposal-skill-iwp1oi`, **no de `main`**: esa
rama tiene 9 commits que `main` no tiene y perderlos habría sido peor que partir
de un punto menos limpio. Se verificó con `git merge-base --is-ancestor`.
