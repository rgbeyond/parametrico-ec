#!/usr/bin/env python3
"""PreToolUse sobre Bash — frena lo irreversible.

Complementa a permissions.deny de settings.json. Atrapa lo que un patron de
permisos no ve bien: el empuje forzado a una rama protegida sea cual sea su
forma, y el SQL destructivo dentro de un comando compuesto.

POR QUE ES PYTHON PURO Y NO UN ENVOLTORIO DE SHELL
---------------------------------------------------
Tres versiones anteriores fallaron, y cada fallo ensena algo:

1. Buscaba el patron como subcadena en cualquier parte del comando. Un
   `cat > doc.md <<EOF` que DOCUMENTABA la prohibicion contenia el texto
   prohibido y se bloqueaba a si mismo.
2. Partia el comando con una expresion regular sobre `&&`, `;` y `|`. Eso parte
   tambien los operadores que van DENTRO de una cadena entrecomillada, asi que
   `echo "a && git push -f main"` producia un trozo que empezaba con `git`.
3. Era un script de bash que canalizaba el comando a `python3 - <<'PY'`. El
   heredoc y la tuberia compiten por stdin: el heredoc gana, Python lee su
   programa de ahi, y `sys.stdin.read()` devuelve vacio. El guardia quedo
   INERTE y dejaba pasar todo — el peor modo de fallo posible, porque parece
   que funciona.

De ahi las dos decisiones de este archivo: **un solo proceso, sin capa de
shell**, y **lexar de verdad** con `shlex`, que respeta el entrecomillado y
devuelve los operadores como tokens propios. Lo que queda en posicion de
comando es lo que el shell ejecutaria.

Un guardia que se bloquea a si mismo ensena a desactivarlo. Uno que falla
abierto es peor: no protege y nadie se entera. Por eso este trae su propia
suite: `.claude/hooks/probar-guardias.py`.

Contrato: exit 0 deja pasar; exit 2 bloquea y stderr le explica a Claude.
"""
import json
import re
import shlex
import sys

SEPARADORES = {";", "&", "&&", "|", "||", "\n", "(", ")"}

REGLAS = [
    (r'^(sudo\s+)?git\s+.*\bpush\b.*(--force\b|--force-with-lease\b|\s-f(\s|$))'
     r'.*\b(main|master|production)\b',
     "empuje forzado sobre una rama protegida. La rama de trabajo se empuja "
     "normal; a main se llega por revision humana y mezcla."),
    (r'^(sudo\s+)?git\s+(filter-branch|filter-repo)\b',
     "reescritura de historia. Git es el mecanismo de preservacion de este "
     "proyecto; la historia no se reescribe."),
    (r'^(sudo\s+)?git\s+rebase\s+.*(-i\b|--interactive\b)',
     "rebase interactivo. Reescribe historia ya comiteada."),
    (r'^(sudo\s+)?git\s+reset\s+--hard\s+origin/(main|master)\b',
     "descarta el trabajo local contra la rama protegida."),
    (r'^(sudo\s+)?supabase\s+db\s+(reset|remote\s+commit)\b',
     "esto reescribe una base. El flujo es: migracion en el repositorio, "
     "scripts/validar-sql.sh, desarrollo, y produccion solo con aprobacion "
     "humana."),
    (r'^(sudo\s+)?rm\s+(-[a-zA-Z]*[rR][a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*[rR])\s+'
     r'(/|~|\.\.|\*|\$HOME)',
     "borrado recursivo sobre una ruta amplia."),
    (r'^(sudo\s+)?rm\s+.*casos/(recibos|expedientes)',
     "casos/recibos y casos/expedientes son el corpus de regresion del "
     "extractor y contienen datos de cliente. No se borran; hay un plan en "
     "docs/arquitectura/adr-0006-corpus-de-recibos.md."),
]

# El SQL destructivo llega como argumento de una herramienta de base de datos,
# asi que solo se busca cuando el subcomando invoca una. `delete from` sin
# `where` es el caso peligroso; con `where` es trabajo normal de desarrollo.
HERRAMIENTA_BD = r'^(sudo\s+)?(psql|supabase|pg_dump|pgcli)\b'
SQL_DESTRUCTIVO = (r'\b(drop\s+(database|schema\s+public)|truncate\s+table|'
                   r'delete\s+from\s+\w+\s*(;|$))')


def subcomandos(texto):
    """Cada subcomando que el shell ejecutaria, ya sin comillas."""
    # Un heredoc es contenido, no comandos. Se recorta antes de lexar; la linea
    # que lo abre si se analiza.
    texto = re.sub(r"<<-?\s*'?\"?([A-Za-z_][A-Za-z0-9_]*)'?\"?.*?^\1\s*$",
                   " ", texto, flags=re.S | re.M)
    lex = shlex.shlex(texto, posix=True, punctuation_chars=True)
    lex.whitespace_split = True
    try:
        tokens = list(lex)
    except ValueError:
        # Comillas sin cerrar: no se puede lexar con confianza. Se analiza el
        # comando completo, que es el lado conservador.
        return [texto]
    actual, salida = [], []
    for t in tokens:
        if t in SEPARADORES:
            if actual:
                salida.append(actual)
                actual = []
        else:
            actual.append(t)
    if actual:
        salida.append(actual)
    return [" ".join(p) for p in salida]


def revisar(cmd):
    """Devuelve el motivo del bloqueo, o None si el comando puede pasar."""
    for sub in subcomandos(cmd):
        for patron, motivo in REGLAS:
            if re.search(patron, sub, re.I):
                return motivo
        if re.match(HERRAMIENTA_BD, sub, re.I) \
                and re.search(SQL_DESTRUCTIVO, sub, re.I):
            return ("operacion destructiva de base de datos. Si es un cambio "
                    "de esquema, va como migracion en supabase/ y se valida "
                    "con scripts/validar-sql.sh antes de tocar ninguna base.")
    return None


def main():
    try:
        entrada = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0                      # sin entrada legible, no hay que juzgar
    cmd = entrada.get("tool_input", {}).get("command", "")
    if not cmd:
        return 0
    motivo = revisar(cmd)
    if motivo:
        print(f"BLOQUEADO: {motivo}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
