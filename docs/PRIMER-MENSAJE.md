# Cómo arrancar con Claude Code en este repo

## Instalación

macOS o Linux:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Windows, en PowerShell:

```powershell
irm https://claude.ai/install.ps1 | iex
```

Si prefieres interfaz gráfica en lugar de terminal, descarga la aplicación de
escritorio de Claude, que trae Claude Code integrado.

Verifica con `claude doctor` si algo no arranca.

## Primera sesión

```bash
cd ruta/a/paremetrico-ec
claude
```

Claude Code lee `CLAUDE.md` automáticamente, así que ya conoce el proyecto, las
reglas de datos y los pendientes. No hace falta explicarle nada de contexto.

## Primer mensaje sugerido

Pega esto tal cual:

> Lee CLAUDE.md. Después revisa que el repositorio esté completo y que
> `npm install && npm run build` pase. Si falta algún archivo o el build falla,
> dime qué encontraste antes de cambiar nada.

## Segundo mensaje, cuando el build pase

> Estoy configurando Supabase. Verifica que los tres archivos de la carpeta
> supabase sean coherentes entre sí: que toda tabla con RLS tenga políticas,
> que las funciones que se llaman desde el cliente tengan GRANT, y que la
> semilla no choque con el esquema. Reporta lo que encuentres sin corregirlo
> todavía.

## Cosas que Claude Code puede hacer y yo no podía desde el chat

- Ejecutar `npm run build` y corregir errores hasta que pase.
- Hacer `git commit` y `git push` directamente.
- Correr el sitio en local con `npm run dev` y probar contra tu Supabase real.
- Leer y editar cualquier archivo sin que tú muevas zips.

## Buenas costumbres

**Pídele que verifique antes de subir.** "Corre el build y solo si pasa, haz
commit y push." Evita romper el sitio publicado.

**Una tarea por vez.** Este proyecto ya se rompió varias veces por acumular
cambios grandes en un solo paso.

**Usa ramas para cambios de riesgo.** La refactorización de `src/lib/app.js`
es la primera candidata: pídele que trabaje en una rama y que el sitio de
producción no se toque hasta que funcione.
