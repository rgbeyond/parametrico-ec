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

# Ramas que nadie empuja a mano. A main se llega por revision y mezcla.
PROTEGIDAS = r'(main|master|production|prod)'

# Banderas de force en cualquiera de sus formas. `-f` puede venir combinada con
# otras banderas cortas —`git push -uf origin main` es valido— asi que no basta
# buscar `-f` aislado. Lo encontro la revision de la Fase 0.1.
FORCE = r'(--force\b|--force-with-lease\b|(?<![\w-])-[a-eg-zA-Z]*f[a-zA-Z]*(?=\s|$))'

REGLAS = [
    # Empuje forzado nombrando la rama protegida.
    (rf'^(sudo\s+)?git\s+.*\bpush\b.*{FORCE}.*\b{PROTEGIDAS}\b',
     "empuje forzado sobre una rama protegida. La rama de trabajo se empuja "
     "normal; a main se llega por revision humana y mezcla."),
    # Empuje forzado SIN destino explicito. Es peor, no mejor: toma el upstream
    # configurado, que suele ser justamente la rama de la que se partio.
    (rf'^(sudo\s+)?git\s+push\s+([^\s]+\s+)*?{FORCE}(\s+[^\s]+){{0,1}}\s*$',
     "empuje forzado sin destino explicito. Toma el upstream configurado, que "
     "puede ser una rama protegida. Nombra la rama y quita el --force."),
    # Empuje por REFSPEC: `origen:destino`. El nombre de la rama protegida no
    # aparece como argumento suelto, asi que el patron de arriba no lo veia.
    (rf'^(sudo\s+)?git\s+.*\bpush\b.*\s\+?[^\s]*:(refs/heads/)?{PROTEGIDAS}(\s|$)',
     "empuje a una rama protegida por refspec (origen:destino). A las ramas "
     "protegidas se llega por revision y mezcla, no empujando."),
    # `git push origin +main`. El `+` delante del refspec ES la forma corta de
    # --force en git, y no la veia ninguna regla: no hay `--force` ni dos
    # puntos. Un humano aprobando "git push origin +main" en un prompt tampoco
    # distingue ese `+` de un push normal.
    (rf'^(sudo\s+)?git\s+.*\bpush\b.*\s\+(refs/heads/)?{PROTEGIDAS}(\s|$)',
     "empuje forzado sobre una rama protegida: el `+` delante del refspec es "
     "la forma corta de --force en git. A las ramas protegidas se llega por "
     "revision y mezcla."),
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
    (r'^(sudo\s+)?rm\s+((-[a-zA-Z]*[rR][a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*[rR])'
     r'|(-[rR]\s+-f|-f\s+-[rR])|(--recursive\s+--force|--force\s+--recursive))'
     r'\s+(/|~|\.\.|\*|\$HOME|\./?\s*$)',
     "borrado recursivo sobre una ruta amplia."),
    # El corpus se protege por RUTA TOCADA, no por nombre de comando. La version
    # anterior solo miraba `rm` y `find`, y la revision de la Fase 0.1 demostro
    # que `git rm -r casos/recibos`, `mv casos/recibos /tmp` y `shred` pasaban
    # limpio mientras el mensaje decia "no se borran".
    (r'^(sudo\s+)?(rm|find|shred|truncate|mv|cp|git\s+rm|git\s+mv)\b'
     r'.*casos/(recibos|expedientes)',
     "casos/recibos y casos/expedientes son el corpus de regresion del "
     "extractor y contienen datos de cliente. No se borran ni se mueven; hay "
     "un plan en docs/arquitectura/adr-0006-corpus-de-recibos.md."),
    # `find` esquiva la regla de `rm`: no empieza con rm, asi que ni el deny de
    # settings.json ni la regla de arriba lo veian. `-delete` y `-exec` ejecutan.
    (r'^(sudo\s+)?find\s+.*(-delete\b|-exec\b|-execdir\b|-ok\b|-okdir\b)',
     "find con -delete o -exec ejecuta un borrado que las reglas escritas para "
     "`rm` no alcanzan a ver. Si de verdad hace falta, escribe el rm explicito "
     "para que quede a la vista."),
    # Preparar en el indice un archivo que nunca debe entrar al repositorio.
    # `git add -f` existe precisamente para saltarse .gitignore, asi que el
    # .gitignore por si solo no basta como control.
    (r'^(sudo\s+)?git\s+add\s+(.*[\s/])?'
     r'\.env(?!\.example|\.template|\.sample|\.ejemplo)'
     r'(\.[A-Za-z0-9_-]+)*(\s|$)',
     "eso prepara un archivo de entorno para el commit. Los .env llevan "
     "credenciales y nunca entran al repositorio; .env.example si, con "
     "marcadores de posicion. Si usaste -f, estas saltandote el .gitignore a "
     "proposito: no lo hagas con este archivo."),
    (r'^(sudo\s+)?git\s+add\s+.*settings\.local\.json',
     "settings.local.json son permisos personales aprobados sobre la marcha. "
     "Comitearlos los ensancha para todo el equipo en silencio."),
    (r'^(sudo\s+)?git\s+add\s+.*(id_rsa|id_ed25519|\.pem|\.p12|\.pfx|\.key)(\s|$)',
     "eso prepara material de llave privada para el commit."),
]

# Envoltorios que ejecutan lo que reciben como argumento. Si no se miran por
# dentro, `bash -c "git push --force origin main"` esquiva todas las reglas de
# arriba: el subcomando empieza con `bash`, no con `git`.
#
# No se trata de bloquear el envoltorio -`bash -c "npm test"` es normal- sino de
# analizar TAMBIEN su argumento con las mismas reglas.
ENVOLTORIOS = re.compile(
    r'^(sudo\s+)?(bash|sh|zsh|dash|ksh)\s+(-[a-z]*c|--command)\s+', re.I)
# Asignaciones de variable delante del comando real: `env FOO=bar rm -rf /` y
# `FOO=bar rm -rf /`. La documentacion de permisos dice que una regla de deny
# si atraviesa la asignacion; los guardias tienen que hacer lo mismo.
PREFIJO_ENV = re.compile(
    r'^(sudo\s+)?(env\s+)?([A-Za-z_][A-Za-z0-9_]*=[^\s]*\s+)+', re.I)
SOLO_ENV = re.compile(r'^(sudo\s+)?env\s+', re.I)
# Banderas de `env`. -u y -C llevan argumento; -i, -0, -v y -S no.
ENV_BANDERAS = re.compile(r'^((-[uC]\s+\S+|--unset=\S+|--chdir=\S+'
                          r'|-[i0vS]|--ignore-environment|--null)\s*)+', re.I)

# Comandos cuyo HEREDOC es un programa, no contenido inerte. Con estos, recortar
# el cuerpo elimina justo lo que se va a ejecutar y deja una linea (`bash`) que
# no casa con nada. Lo encontro la revision de la Fase 0.1:
#
#     bash <<EOF
#     git push --force origin main
#     EOF
#
# pasaba limpio. El supuesto «un heredoc es contenido, no comandos» es cierto
# para `cat > archivo` y falso para un interprete.
INTERPRETE = re.compile(
    r'^(sudo\s+)?(env\s+)?([A-Za-z_][A-Za-z0-9_]*=\S*\s+)*'
    r'(bash|sh|zsh|dash|ksh|python3?|node|psql|supabase|pgcli)\b', re.I)

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
        if not m:
            continue
        fin = m.group(2)
        cuerpo = []
        while i < len(lineas) and lineas[i].strip() != fin:
            cuerpo.append(lineas[i])
            i += 1
        i += 1                          # se salta tambien el delimitador final
        # Si quien abre el heredoc es un INTERPRETE, el cuerpo ES el programa:
        # se conserva para analizarlo en vez de recortarlo. Solo se descarta
        # cuando el heredoc alimenta a algo que escribe archivos, como
        # `cat > doc.md`, que es el caso para el que se hizo el recorte.
        cabeza = linea.split("<<")[0].strip()
        if INTERPRETE.match(cabeza):
            salida.extend(cuerpo)
            # Si quien abre es una herramienta de base de datos, el cuerpo es
            # SQL y no comandos: por si solo no casa con HERRAMIENTA_BD, que
            # exige que el subcomando empiece con psql o supabase. Se agrega una
            # linea sintetica con la herramienta delante para que la regla de
            # SQL destructivo lo vea. Sin esto, `psql <<EOF / drop schema … /
            # EOF` pasaba limpio.
            if re.match(HERRAMIENTA_BD, cabeza, re.I):
                salida.append(cabeza + " " + " ".join(cuerpo))
    return "\n".join(salida)


def desenvolver(sub, profundidad=0):
    """Quita envoltorios y devuelve el comando real que se va a ejecutar.

    Devuelve una lista: el subcomando tal cual, mas lo que haya dentro de un
    `bash -c`, `sh -c` o detras de asignaciones de variable. Los dos se
    analizan, porque el envoltorio en si puede ser legitimo y el contenido no.

    Se limita la profundidad: `bash -c "bash -c '...'"` es valido y anidarlo sin
    tope permitiria agotar la pila con una entrada hecha a proposito.
    """
    salida = [sub]
    if profundidad >= 3:
        return salida
    # Asignaciones de variable delante: `env FOO=bar cmd` y `FOO=bar cmd`.
    #
    # `env` tambien acepta banderas, y ahi estaba el hueco: tras quitar «env »,
    # `env -u FOO git push --force origin main` dejaba un resto que empieza con
    # «-u» y ninguna regla anclada en `^git` casaba. Las banderas se descartan
    # antes de recursar. -u y -C llevan argumento propio; -i, -0, -v y -S no.
    resto = sub
    if SOLO_ENV.match(resto):
        resto = SOLO_ENV.sub("", resto, count=1)
        resto = ENV_BANDERAS.sub("", resto).strip()
    m = PREFIJO_ENV.match(resto)
    if m:
        resto = resto[m.end():]
    if resto and resto != sub:
        salida.extend(desenvolver(resto.strip(), profundidad + 1))
    # `bash -c "..."`: el argumento es un comando completo. Ya viene sin
    # comillas porque el lexer las quito, asi que se re-analiza entero.
    m = ENVOLTORIOS.match(sub)
    if m:
        interior = sub[m.end():].strip()
        if interior:
            for s in subcomandos(interior):
                salida.extend(desenvolver(s, profundidad + 1))
    return salida


# --- Lectura de archivos de credenciales desde Bash. -----------------------
#
# Las reglas `Read(...)` de settings.json bloquean las herramientas de archivo
# de Claude y los comandos de lectura que Claude Code reconoce -`cat`, `head`,
# `tail`, `sed`-. NO cubren un subproceso cualquiera. La revision independiente
# lo senalo sobre tres permisos que estan en `allow`: `diff`, `git show` y
# `node --test`. `diff .env /dev/null` imprime el archivo entero, y ninguna
# regla Read lo ve.
#
# Aqui se cierra por el otro lado: si el TEXTO del comando nombra un archivo de
# credenciales, no importa que comando sea. Es deliberadamente amplio -un
# `echo "no subas el .env"` tambien cae- porque el falso positivo cuesta una
# frase y el falso negativo cuesta una credencial.
#
# Lo que este control NO puede cubrir: un script que arma la ruta en tiempo de
# ejecucion, o un archivo de prueba que la lee por su cuenta. `node --test`
# ejecuta codigo arbitrario por definicion y eso no se arregla con una lista de
# permisos; se arregla no metiendo secretos en el arbol, que es lo que hacen
# guardia-secretos.sh y guardia-commit.py.
# Se compara TOKEN A TOKEN, no por subcadena.
#
# La primera version buscaba el nombre en cualquier parte del texto del
# comando, y eso bloqueaba un script de Python cuyo codigo mencionaba la
# cadena entre comillas. Lo descubrimos en el primer uso: el guardia se
# bloqueo a si mismo. Un control que muerde al primer uso legitimo es un
# control que alguien apaga, y entonces no protege nada.
#
# Partir en tokens deja fuera lo que va dentro de una cadena y deja dentro
# lo que de verdad es un argumento. Se aceptan tres envolturas, porque son
# las que se usan para leer un archivo sin nombrarlo pelado:
#   HEAD:<archivo>      un objeto de git
#   --file=<archivo>    una bandera con el valor pegado
#   ~/.ssh/id_rsa       una ruta
ARCHIVO_SECRETO = re.compile(
    r'(--?[\w-]+=)?'
    r'([\w./-]*:)?'
    r'([~.]{0,2}/|\$HOME/)?'
    r'([\w.~$-]+/)*'
    r'(\.env(?!\.example|\.template|\.sample|\.ejemplo)([.\w-]+)*'
    r'|id_rsa|id_ed25519'
    r'|[\w.-]+\.(pem|p12|pfx|key)'
    r'|\.credentials\.json)$', re.I)
RUTA_SECRETA = re.compile(
    r'(--?[\w-]+=)?(~|\$HOME)/\.(ssh|aws|gnupg)(/|$)', re.I)


def nombra_secreto(texto):
    """Algun argumento de este comando es un archivo de credenciales?"""
    try:
        tokens = shlex.split(texto)
    except ValueError:
        tokens = texto.split()
    return any(ARCHIVO_SECRETO.match(tk) or RUTA_SECRETA.match(tk)
               for tk in tokens)


def revisar(cmd):
    """Devuelve el motivo del bloqueo, o None si el comando puede pasar."""
    for sub in subcomandos(cmd):
        for real in desenvolver(sub):
            for patron, motivo in REGLAS:
                if re.search(patron, real, re.I):
                    return motivo
            if nombra_secreto(real):
                return ("el comando nombra un archivo de credenciales. Las "
                        "reglas Read() de settings.json cubren cat, head, "
                        "tail y sed, pero no un subproceso cualquiera: "
                        "`diff .env /dev/null` imprimiria el archivo entero. "
                        "Si necesitas saber QUE variables hacen falta, lee "
                        ".env.example, que si esta permitido. Los valores se "
                        "consultan en el panel de Netlify o de Supabase.")
            if re.match(HERRAMIENTA_BD, real, re.I) \
                    and re.search(SQL_DESTRUCTIVO, real, re.I):
                return ("operacion destructiva de base de datos. Si es un "
                        "cambio de esquema, va como migracion en supabase/ y "
                        "se valida con scripts/validar-sql.sh antes de tocar "
                        "ninguna base.")
    return None


def main():
    """FALLA CERRADO.

    La version anterior devolvia 0 ante una entrada ilegible: "sin entrada
    legible, no hay que juzgar". Eso suena razonable y es exactamente el modo
    de fallo que ya nos mordio una vez, cuando el guardia quedo inerte por un
    heredoc y siguio devolviendo 0 como si todo estuviera bien.

    Un control de seguridad que no puede leer su entrada NO SABE si la
    operacion es peligrosa. Aprobar en la duda convierte cualquier fallo del
    guardia -un JSON malformado, un campo que cambia de nombre en una version
    futura de Claude Code, un bug propio- en una via de escape silenciosa.

    Asi que: si la entrada no se entiende y el evento SI trae algo que juzgar,
    se bloquea y se dice por que. Es molesto un dia y honesto siempre.

    La excepcion legitima: stdin vacio. Eso no es una entrada rota, es que no
    hay evento -corrieron el script a mano, por ejemplo-. Ahi no hay nada que
    decidir y devolver 0 es correcto.
    """
    crudo = sys.stdin.read()
    if not crudo.strip():
        return 0                      # sin evento: no hay decision que tomar

    try:
        entrada = json.loads(crudo)
    except (json.JSONDecodeError, ValueError) as e:
        print(f"BLOQUEADO: el guardia no pudo leer su entrada ({e}). Un "
              f"control de seguridad que no entiende lo que se le pide no "
              f"puede aprobarlo. Revisa .claude/hooks/guardia-destructivo.py "
              f"y corre .claude/hooks/probar-guardias.py.", file=sys.stderr)
        return 2

    if not isinstance(entrada, dict):
        print("BLOQUEADO: la entrada del guardia no es un objeto JSON.",
              file=sys.stderr)
        return 2

    ti = entrada.get("tool_input")
    if ti is None:
        # Evento sin tool_input: no es una llamada a herramienta que juzgar.
        return 0
    if not isinstance(ti, dict):
        print("BLOQUEADO: tool_input no es un objeto; el guardia no puede "
              "determinar que comando se va a ejecutar.", file=sys.stderr)
        return 2

    cmd = ti.get("command")
    if cmd is None:
        # PreToolUse sobre Bash siempre trae `command`. Que falte significa que
        # el contrato cambio o que el matcher esta mal: no se aprueba a ciegas.
        print("BLOQUEADO: el evento no trae tool_input.command. Este guardia "
              "solo debe correr sobre Bash; si el contrato de Claude Code "
              "cambio, hay que actualizarlo, no ignorarlo.", file=sys.stderr)
        return 2
    if not isinstance(cmd, str):
        print("BLOQUEADO: tool_input.command no es texto.", file=sys.stderr)
        return 2
    if not cmd.strip():
        return 0                      # comando vacio: nada que ejecutar

    try:
        motivo = revisar(cmd)
    except Exception as e:                       # noqa: BLE001
        # Un bug del propio guardia tampoco puede volverse permiso.
        print(f"BLOQUEADO: el guardia fallo al analizar el comando ({type(e).__name__}: {e}). "
              f"No puede aprobar lo que no logro revisar.", file=sys.stderr)
        return 2

    if motivo:
        print(f"BLOQUEADO: {motivo}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
