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
    (r'^(sudo\s+)?(rm|find)\s+.*casos/(recibos|expedientes)',
     "casos/recibos y casos/expedientes son el corpus de regresion del "
     "extractor del PORTAFOLIO y contienen datos de cliente. No se borran; el "
     "plan esta en propuestas-fv/docs/arquitectura/adr-0006-corpus-de-"
     "recibos.md. Este repositorio no tiene casos/; la regla se conserva porque "
     "los dos guardias son el mismo archivo."),
    # `find` esquiva la regla de `rm`: no empieza con rm, asi que ni el deny de
    # settings.json ni la regla de arriba lo veian. `-delete` y `-exec` ejecutan.
    (r'^(sudo\s+)?find\s+.*(-delete\b|-exec\b|-execdir\b|-ok\b|-okdir\b)',
     "find con -delete o -exec ejecuta un borrado que las reglas escritas para "
     "`rm` no alcanzan a ver. Si de verdad hace falta, escribe el rm explicito "
     "para que quede a la vista."),
]

# El SQL destructivo llega como argumento de una herramienta de base de datos,
# asi que solo se busca cuando el subcomando invoca una. `delete from` sin
# `where` es el caso peligroso; con `where` es trabajo normal de desarrollo.
HERRAMIENTA_BD = r'^(sudo\s+)?(psql|supabase|pg_dump|pgcli)\b'
SQL_DESTRUCTIVO = (r'\b(drop\s+(database|schema\s+public)|truncate\s+table|'
                   r'delete\s+from\s+\w+\s*(;|$))')


def subcomandos(texto):
    """Cada subcomando que el shell ejecutaria, ya sin comillas.

    El salto de linea se parte ANTES de lexar, no dentro. `shlex` lo trata como
    espacio en blanco y nunca lo emite como token, asi que tenerlo en
    SEPARADORES no servia de nada: un comando de dos lineas se concatenaba en un
    solo pseudo-subcomando y los patrones anclados con `^` dejaban de casar.

        cd /workspace/propuestas-fv
        git push --force origin main

    daba el sub "cd /workspace/propuestas-fv git push --force origin main", que
    no empieza con `git` y pasaba limpio. Lo encontro la revision independiente
    de la Fase 0; los comandos multilinea son rutina, no una rareza.
    """
    salida = []
    for linea in recortar_heredocs(texto).split("\n"):
        linea = linea.strip()
        if not linea or linea.startswith("#"):
            continue
        lex = shlex.shlex(linea, posix=True, punctuation_chars=True)
        lex.whitespace_split = True
        try:
            tokens = list(lex)
        except ValueError:
            # Comillas sin cerrar: no se puede lexar con confianza. Se analiza
            # la linea completa, que es el lado conservador.
            salida.append(linea)
            continue
        actual = []
        for t in tokens:
            if t in SEPARADORES:
                if actual:
                    salida.append(" ".join(actual))
                    actual = []
            else:
                actual.append(t)
        if actual:
            salida.append(" ".join(actual))
    return salida


def recortar_heredocs(texto):
    """Quita el CUERPO de cada heredoc, conservando la linea que lo abre.

    Un heredoc es contenido, no comandos: documentar una prohibicion no puede
    dispararla. Pero el recorte tiene que ser preciso, porque tambien es una via
    de escape: la primera version borraba desde `<<X` hasta la primera linea
    igual a `X` en cualquier parte del texto, asi que

        echo "<<X"
        git push --force origin main
        X

    se eliminaba entero. Ahora se procesa linea por linea: el delimitador solo
    cuenta si la linea que lo abre TERMINA con el operador de heredoc, que es lo
    que hace el shell de verdad.
    """
    lineas = texto.split("\n")
    salida, i = [], 0
    apertura = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1\s*$")
    while i < len(lineas):
        linea = lineas[i]
        salida.append(linea)
        m = apertura.search(linea)
        i += 1
        if m:
            fin = m.group(2)
            while i < len(lineas) and lineas[i].strip() != fin:
                i += 1
            i += 1                      # se salta tambien el delimitador final
    return "\n".join(salida)


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
