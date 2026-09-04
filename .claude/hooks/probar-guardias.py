#!/usr/bin/env python3
"""Suite de los guardias de PreToolUse.

Correr:  python3 .claude/hooks/probar-guardias.py

Existe porque los guardias fallaron tres veces durante su propia construccion, y
uno de esos fallos fue el peor posible: quedar INERTE y dejar pasar todo. Un
guardia sin prueba no se puede afirmar que protege.

DOS PRECAUCIONES DEL ARNES, Y POR QUE
--------------------------------------
1. Los comandos de prueba van como DATOS, nunca en la linea de shell. Si el
   arnes los escribiera en un comando, activaria el guardia que intenta probar.
2. Las cadenas con forma de credencial se ARMAN EN TIEMPO DE EJECUCION, por
   trozos. Escribirlas literales haria que el guardia de secretos bloqueara la
   escritura de este mismo archivo, y que el guardia de commit bloqueara el
   commit. Las dos cosas pasaron de verdad durante la Fase 0.1: una fijacion
   que se habia escrito antes del detector de prefijos -SERVICE_ROLE- llevaba
   `sbp_` seguido de veintiseis caracteres y freno el commit de la rama limpia.
   El guardia tenia razon; la fijacion se partio en trozos.

La alternativa —eximir a este archivo de los guardias— seria una via de escape:
cualquiera podria meter una credencial llamando a su archivo como este. Es mas
sano que el guardia siga siendo estricto y que la prueba se adapte.

ALCANCE: esta suite mide LOS HOOKS, no la politica efectiva. `permissions.deny`
de settings.json bloquea cosas que aqui salen como "pasa" —`rm -rf` de cualquier
ruta, por ejemplo— porque son dos capas distintas. Que la suite salga en verde
dice que los hooks hacen lo suyo, no que la politica completa haga lo que dice.

El total NO se escribe aqui. La version anterior decia 35 cuando ya iban 144:
un numero fijado en prosa se queda viejo en la ronda siguiente, y un documento
que se contradice a dos pantallas ensena a no leerlo.
"""
import json
import pathlib
import re
import subprocess
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
DESTRUCTIVO = str(AQUI / "guardia-destructivo.py")
SECRETOS = str(AQUI / "guardia-secretos.sh")

# --- Cadenas sensibles, armadas por trozos. Ver precaucion 2 del encabezado.
GUION = "-" * 5
LLAVE_PRIVADA = GUION + "BEGIN RSA PRIVATE " + "KEY" + GUION
JWT_FALSO = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
             "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ")
SERVICE_ROLE = ("service" + "_role = " + "sbp" + "_"
                + "abcdefghij0123456789xyz")
VITE_CREDENCIAL = "VITE_" + "BANXICO_" + "TOKEN=abc123"
PAT_SUPABASE = "sbp" + "_" + "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b"
SECRETO_SUPABASE = "sb" + "_secret_" + "AbCdEf0123456789GhIjKlMnOpQrStUv"
PAT_NETLIFY = "nfp" + "_" + "9z8y7x6w5v4u3t2s1r0q9p8o7n6m5l4k3j2i1h0g"
PAT_GITHUB = "ghp" + "_" + "AbCdEf0123456789GhIjKlMnOpQrStUvWxYz"
LLAVE_AWS = "AKIA" + "IOSFODNN7EXAMPLE"
HEX_64 = "3f" * 32

DESTRUCTIVO_BLOQUEAR = [
    ("force push a main", "git push --force origin main"),
    ("force push encadenado", "npm test && git push -f origin main"),
    ("force-with-lease a main", "git push --force-with-lease origin main"),
    ("filter-branch", "git filter-branch --all"),
    ("rebase interactivo", "git rebase -i HEAD~3"),
    ("reset hard contra origin/main", "git reset --hard origin/main"),
    ("psql drop schema", 'psql -c "drop schema public cascade"'),
    ("supabase db reset", "supabase db reset --linked"),
    ("rm -rf raiz", "rm -rf /"),
    ("rm -rf home", "rm -rf $HOME"),
    ("borrar corpus de recibos", "rm -rf casos/recibos"),
    ("borrar expedientes", "rm -f casos/expedientes/x.json"),
    # Los tres siguientes los encontro la revision independiente de la Fase 0.
    # Los dos primeros PASABAN: shlex consume el salto de linea como espacio en
    # blanco y nunca lo emite como token, asi que un comando multilinea se
    # concatenaba en un solo pseudo-subcomando que ya no empezaba con `git`.
    ("multilinea: cd y luego force push",
     "cd /workspace/propuestas-fv\ngit push --force origin main"),
    ("multilinea: comentario y luego db reset",
     "# preparar\nsupabase db reset --linked"),
    # Heredoc falso: el recorte borraba desde `<<X` hasta la primera linea que
    # fuera exactamente `X`, y con eso se llevaba el comando peligroso de enmedio.
    ("heredoc falso que esconde un force push",
     'echo "<<X"\ngit push --force origin main\nX'),
    # find esquiva la regla de rm: no empieza con `rm`.
    ("find -delete sobre el corpus",
     "find casos/recibos -name '*.pdf' -delete"),
    ("find -exec rm sobre el corpus",
     "find casos/recibos -type f -exec rm -f {} ;"),

    # --- Fase 0.1: casos adversariales. Todos PASABAN antes del endurecimiento.
    # La leccion de la Fase 0 fue que un control puede fallar abierto sin que
    # nadie se entere. Estos son las formas equivalentes de la misma operacion
    # peligrosa escritas distinto, que es exactamente como se esquiva un patron.

    # Empuje a rama protegida por refspec: el nombre `main` no aparece como
    # argumento suelto sino como destino de un refspec.
    ("refspec HEAD:main", "git push origin HEAD:main"),
    ("refspec rama:main", "git push origin feature:main"),
    ("refspec con refs/heads", "git push origin HEAD:refs/heads/main"),
    ("refspec a master", "git push origin HEAD:master"),
    ("refspec multilinea", "cd /tmp\ngit push origin HEAD:main"),
    # Empuje forzado sin nombrar la rama: si el upstream es main, borra.
    ("force push sin destino explicito", "git push --force"),
    ("force push -f pelado", "git push -f"),

    # Envoltorios de shell: no pueden volverse una via de escape trivial.
    ("bash -c con force push", 'bash -c "git push --force origin main"'),
    ("sh -c con db reset", 'sh -c "supabase db reset --linked"'),
    ("env VAR delante de un force push",
     "env FOO=bar git push --force origin main"),
    ("asignacion inline delante de rm",
     "FOO=bar rm -rf /"),

    # Preparar en el indice archivos que no deben entrar nunca.
    ("git add forzado de .env", "git add -f .env"),
    ("git add de .env.local", "git add .env.local"),
    ("git add de settings.local.json",
     "git add .claude/settings.local.json"),
    ("git add de una llave privada", "git add id_rsa"),
    ("git add -A con .env en la misma linea", "git add -f .env.production"),

    # --- Fase 0.1, segunda ronda. Los encontro la revision independiente de las
    # ramas limpias, ejecutando el guardia. Los catorce PASABAN.
    # El `+` delante de un refspec ES --force en git, y no habia ni --force ni
    # dos puntos que ver.
    ("refspec con + a main", "git push origin +main"),
    ("refspec con + y refs/heads", "git push origin +refs/heads/main"),
    # `-f` combinada con otra bandera corta. git lo acepta; la regla buscaba -f
    # aislado.
    ("banderas combinadas -uf", "git push -uf origin main"),
    ("banderas combinadas -fu", "git push -fu origin main"),
    # `env` con banderas: tras quitar «env », el resto empezaba con «-u» y
    # ninguna regla anclada en ^git casaba.
    ("env -u antes de force push",
     "env -u FOO git push --force origin main"),
    ("env -i antes de force push", "env -i git push --force origin main"),
    # Heredoc a un INTERPRETE: el cuerpo es el programa, y el recorte eliminaba
    # justo la parte peligrosa dejando una linea (`bash`) que no casa con nada.
    ("heredoc que alimenta a bash",
     "bash <<EOF\ngit push --force origin main\nEOF"),
    ("heredoc que alimenta a sh -s", "sh -s <<'EOF'\nrm -rf /\nEOF"),
    ("heredoc que alimenta a psql",
     "psql <<EOF\ndrop schema public cascade;\nEOF"),
    # El corpus se protegia por nombre de comando y no por ruta tocada.
    ("git rm del corpus", "git rm -r casos/recibos"),
    ("mv del corpus", "mv casos/recibos /tmp/x"),
    ("shred del corpus", "shred -u casos/recibos/a.pdf"),
    # Banderas de rm separadas y largas.
    ("rm -r -f separadas", "rm -r -f /"),
    ("rm con banderas largas", "rm --recursive --force /"),

    # --- Lectura de credenciales desde Bash. La revision independiente lo vio
    # sobre `diff`, `git show` y `node --test`, que estan en `allow`: las
    # reglas Read() no cubren un subproceso cualquiera.
    ("diff contra un .env", "diff .env /dev/null"),
    ("git show de un .env versionado", "git show HEAD:.env"),
    ("cat de un .env.local", "cat .env.local"),
    ("llave privada del usuario", "cat ~/.ssh/id_ed25519"),
    ("certificado por extension", "cp servidor.pem /tmp/x"),
    ("credenciales de AWS", "cat $HOME/.aws/credentials"),
    ("envuelto en bash -c", "bash -c 'diff .env respaldo'"),
    ("credenciales de Claude", "cat ~/.claude/.credentials.json"),
    # La comparacion es por TOKEN, no por subcadena: la primera version
    # bloqueaba un script cuyo codigo mencionaba el nombre entre comillas.
    ("objeto de git con dos puntos", "git show HEAD:.env"),
    ("ruta relativa hacia arriba", "cat ../otro/.env.production"),
    ("bandera con valor pegado", "cat --file=.env"),
    # Un patron de grep que es identico a un nombre de archivo tambien cae.
    # Es fallo cerrado a proposito: nadie puede distinguirlos, y equivocarse
    # del otro lado cuesta una credencial.
    ("patron de grep indistinguible", "grep -rn .env docs/"),
]

DESTRUCTIVO_PASAR = [
    ("push normal a rama de trabajo",
     "git push -u origin claude/phase0-engineering-layer"),
    ("push normal sin force", "git push origin claude/algo"),
    ("npm test", "npm test"),
    ("npm run build encadenado", "npm test && npm run build"),
    ("heredoc que DOCUMENTA lo prohibido",
     "cat > d.md <<'EOF'\nNunca uses supabase db reset ni "
     "git push --force origin main ni rm -rf /\nEOF"),
    ("operadores dentro de comillas",
     'echo "a && git push -f origin main"'),
    ("grep del texto prohibido", 'grep -rn "supabase db reset" docs/'),
    ("rm de archivo temporal", "rm -f /tmp/salida.txt"),
    ("git log", "git log --oneline -5"),
    ("psql select normal", 'psql -c "select count(*) from perfiles"'),
    ("delete acotado en desarrollo",
     'psql -c "delete from pf_recibos where id = 1"'),

    # --- Fase 0.1: lo que NO debe volverse doloroso. Un guardia que estorba se
    # desactiva, y entonces no protege nada.
    ("git add de un archivo fuente", "git add src/motor/roi.js"),
    ("git add de todo el arbol", "git add -A"),
    ("git add de una plantilla de entorno", "git add .env.example"),
    ("git add del gitignore", "git add .gitignore"),
    ("bash -c inofensivo", 'bash -c "npm test"'),
    ("sh -c inofensivo", 'sh -c "ls -la"'),
    ("env con un comando inofensivo", "env NODE_ENV=test npm test"),
    ("texto entrecomillado que menciona lo prohibido",
     'echo "no uses git push --force origin main"'),
    ("commit normal", 'git commit -m "arregla el calculo"'),
    ("push a rama de trabajo por refspec",
     "git push origin HEAD:claude/phase0-hardening"),

    # La plantilla SI se lee: es lo que documenta que variables hacen falta.
    ("leer la plantilla", "cat .env.example"),
    ("leer la plantilla con ruta", "cat ../propuestas-fv/.env.ejemplo"),
    ("correr las pruebas", "node --test src/motor/pruebas/"),
    # Lo que va DENTRO de una cadena no es un argumento.
    ("el nombre dentro de una cadena de Python",
     "python3 -c 'x = (\".env\", \"http\")'"),
    ("una ruta que solo contiene la palabra", "cat src/lib/entorno.js"),
]

SECRETOS_BLOQUEAR = [
    ("escribir .env", "/x/.env", "A=1"),
    ("escribir .env.local", "/x/.env.local", "A=1"),
    ("JWT en el contenido", "/x/a.js", f'const k="{JWT_FALSO}"'),
    ("llave privada", "/x/a.js", LLAVE_PRIVADA),
    ("valor de service role", "/x/a.js", SERVICE_ROLE),
    ("VITE_ con nombre de credencial", "/x/a.js", VITE_CREDENCIAL),
    ("archivo .pem", "/x/cert.pem", "x"),
    # Los siguientes los encontro la revision independiente: el guardia no
    # reconocia NINGUNA de las credenciales que esta misma fase introdujo.
    ("token personal de Supabase", "/x/a.js", "TOKEN = " + PAT_SUPABASE),
    ("llave secreta de Supabase", "/x/a.js", "k = " + SECRETO_SUPABASE),
    ("token personal de Netlify", "/x/a.js", "TOKEN = " + PAT_NETLIFY),
    ("token de Banxico", "/x/a.js", "BANXICO_" + "TOKEN = " + HEX_64),
    ("token de GitHub", "/x/a.js", "t = " + PAT_GITHUB),
    ("llave de acceso de AWS", "/x/a.js", "id = " + LLAVE_AWS),
]

SECRETOS_PASAR = [
    ("mencion en prosa de la llave de servicio", "/x/CLAUDE.md",
     "la llave service" + "_role nunca entra al repositorio"),
    ("plantilla .env.example", "/x/.env.example",
     "VITE_SUPABASE_ANON_KEY=<llave-anonima-publicable>"),
    ("lectura normal de una VITE_", "/x/a.js",
     "const url = import.meta.env.VITE_SUPABASE_URL"),
    ("documentar el prefijo VITE_", "/x/doc.md",
     "El prefijo VITE_ incrusta el valor en el paquete y lo publica."),
]


# --- Fase 0.1: entradas rotas. Un guardia que no entiende su entrada NO SABE si
# la operacion es peligrosa, y aprobar en la duda convierte cualquier fallo
# -JSON malformado, un campo renombrado en una version futura de Claude Code, un
# bug propio- en una via de escape silenciosa. Ya nos paso una vez: el guardia
# quedo inerte por un heredoc y siguio devolviendo 0 como si funcionara.
#
# La unica excepcion legitima es stdin vacio: eso no es entrada rota, es que no
# hay evento.
CRUDO_BLOQUEAR = [
    ("JSON malformado", '{"tool_input": {"command"'),
    ("JSON que no es objeto", '["git push --force origin main"]'),
    ("tool_input que no es objeto", '{"tool_input": "git push -f origin main"}'),
    ("command ausente", '{"tool_input": {"file_path": "/x"}}'),
    ("command que no es texto", '{"tool_input": {"command": 42}}'),
    ("texto plano en vez de JSON", 'git push --force origin main'),
]

CRUDO_PASAR = [
    ("stdin vacio", ""),
    ("solo espacios", "   \n  "),
    ("evento sin tool_input", '{"hook_event_name": "SessionStart"}'),
    ("comando vacio", '{"tool_input": {"command": ""}}'),
]

# El guardia de secretos tiene el mismo contrato salvo en un punto: su campo
# obligatorio es file_path, y una escritura sin contenido legible tampoco se
# aprueba a ciegas.
CRUDO_SECRETOS_BLOQUEAR = [
    ("JSON malformado", '{"tool_input": {"file_path"'),
    ("JSON que no es objeto", '"solo una cadena"'),
    ("tool_input que no es objeto", '{"tool_input": 7}'),
]

CRUDO_SECRETOS_PASAR = [
    ("stdin vacio", ""),
    ("evento sin tool_input", '{"hook_event_name": "SessionStart"}'),
]


def correr(hook, payload):
    p = subprocess.run([hook], input=json.dumps(payload),
                       capture_output=True, text=True)
    return p.returncode, p.stderr.strip()


def correr_crudo(hook, crudo):
    """Alimenta al guardia con texto tal cual, sin serializar."""
    p = subprocess.run([hook], input=crudo, capture_output=True, text=True)
    return p.returncode, p.stderr.strip()


def bloque_crudo(titulo, casos, hook, esperado):
    fallos = 0
    print(f"\n=== {titulo} (exit {esperado}) ===")
    for nombre, crudo in casos:
        codigo, err = correr_crudo(hook, crudo)
        ok = codigo == esperado
        fallos += not ok
        marca = "ok   " if ok else "FALLA"
        print(f"  {marca} {nombre:<40} exit={codigo} {err[:46]}")
    return fallos, len(casos)


def bloque(titulo, casos, hook, construir, esperado):
    fallos = 0
    print(f"\n=== {titulo} (exit {esperado}) ===")
    for caso in casos:
        nombre = caso[0]
        codigo, err = correr(hook, construir(*caso[1:]))
        ok = codigo == esperado
        fallos += not ok
        marca = "ok   " if ok else "FALLA"
        print(f"  {marca} {nombre:<40} exit={codigo} {err[:46]}")
    return fallos, len(casos)


COMMIT = str(AQUI / "guardia-commit.py")

# --- guardia-commit: se prueba contra un repositorio de verdad, porque lee el
# indice con git. Un arnes que simulara la salida de `git diff --cached` estaria
# probando la simulacion, no el guardia.
# Cada caso es un diccionario para que los que necesitan algo raro -no preparar
# nada, borrar un archivo ya versionado, envolver el comando- no obliguen a
# alargar una tupla que los demas no usan.
#
#   nombre    etiqueta
#   archivos  [(ruta, contenido)] que se escriben
#   preparar  si se hace `git add` de ellos (por omision, si)
#   forzar    `git add -f`, para vencer al .gitignore del repo de prueba
#   previo    [(ruta, contenido)] que se comitean ANTES, para tener historia
#   borrar    rutas cuya BAJA se prepara
#   cmd       el comando que ve el guardia
#   bloquea   exit esperado: 2 si bloquea, 0 si pasa
COMMIT_CASOS = [
    dict(nombre="archivo fuente normal",
         archivos=[("src/x.js", "export const a = 1;\n")], bloquea=False),
    dict(nombre="plantilla .env.example",
         archivos=[(".env.example", "VITE_URL=<pon-la-url>\n")],
         bloquea=False),
    dict(nombre="archivo .env", archivos=[(".env", "A=1\n")], forzar=True,
         bloquea=True),
    dict(nombre="archivo .env.local", archivos=[(".env.local", "A=1\n")],
         forzar=True, bloquea=True),
    dict(nombre="settings.local.json",
         archivos=[(".claude/settings.local.json", '{"permissions":{}}\n')],
         forzar=True, bloquea=True),
    dict(nombre="llave privada por nombre", archivos=[("id_rsa", "x\n")],
         forzar=True, bloquea=True),
    dict(nombre="PDF de cliente NUEVO en el corpus",
         archivos=[("casos/recibos/12345_2601.pdf", "%PDF-1.4\n")],
         bloquea=True),
    dict(nombre="PDF fuera del corpus protegido",
         archivos=[("docs/diagrama.pdf", "%PDF-1.4\n")], bloquea=False),
    dict(nombre="credencial dentro del contenido preparado",
         archivos=[("src/y.js", "const t = " + PAT_SUPABASE + ";\n")],
         bloquea=True),
    dict(nombre="prosa que menciona una credencial",
         archivos=[("docs/z.md",
                    "El token sbp_ nunca entra al repositorio.\n")],
         bloquea=False),

    # --- Fase 0.1, segunda ronda. Los cuatro primeros PASABAN.
    #
    # `commit -a` prepara los archivos rastreados despues del hook, asi que
    # mirar solo el indice no veia nada. Hace falta que el archivo YA este
    # versionado y luego se modifique sin preparar: eso es lo que `-a` recoge.
    dict(nombre="-am con credencial sin preparar",
         previo=[("src/y.js", "export const a = 1;\n")],
         archivos=[("src/y.js", "const t = " + PAT_SUPABASE + ";\n")],
         preparar=False, cmd='git commit -am "x"', bloquea=True),
    dict(nombre="--all con credencial sin preparar",
         previo=[("src/y.js", "export const a = 1;\n")],
         archivos=[("src/y.js", "const t = " + PAT_SUPABASE + ";\n")],
         preparar=False, cmd='git commit --all -m "x"', bloquea=True),
    dict(nombre="commit envuelto en bash -c",
         archivos=[(".env", "A=1\n")], forzar=True,
         cmd='bash -c "git commit -m arreglo"', bloquea=True),
    dict(nombre="baja preparada del corpus protegido",
         previo=[("casos/recibos/99999_2512.pdf", "%PDF-1.4\n")],
         borrar=["casos/recibos/99999_2512.pdf"], bloquea=True),
    dict(nombre="archivo nuevo no-PDF en el corpus",
         archivos=[("casos/recibos/12345_2601.dat", "datos\n")],
         bloquea=True),

    # Y estos NO deben bloquear: un guardia que muerde de mas se apaga.
    dict(nombre="-m con la letra a en el mensaje",
         archivos=[("src/x.js", "export const a = 1;\n")],
         cmd='git commit -m "quita -a del script"', bloquea=False),
    dict(nombre="--amend limpio",
         previo=[("src/x.js", "export const a = 1;\n")],
         archivos=[("src/x.js", "export const a = 2;\n")],
         cmd='git commit --amend --no-edit', bloquea=False),
    dict(nombre="baja de un archivo fuera del corpus",
         previo=[("src/viejo.js", "export const a = 1;\n")],
         borrar=["src/viejo.js"], bloquea=False),
    # Binarios DE VERDAD, con bytes que no son UTF-8. El guardia reventaba al
    # decodificar el diff y bloqueaba por excepcion: fallaba cerrado con el
    # mensaje equivocado, y de paso bloqueaba commits legitimos con cualquier
    # binario en el indice.
    dict(nombre="binario real fuera del corpus pasa",
         archivos=[("src/assets/icono.png",
                    b"\x89PNG\r\n\x1a\n\x00\x80\x9f\xfe datos")],
         bloquea=False),
    dict(nombre="binario real en el corpus bloquea por la RUTA",
         archivos=[("casos/recibos/00000_0000.pdf",
                    b"%PDF-1.4\n\x80\x9f\xfe\xd0\xc3 flujo binario")],
         bloquea=True),
]


ENVOLTORIO = str(AQUI / "ejecutar-guardia.sh")


def probar_envoltorio():
    """El envoltorio de arranque: que un guardia ausente no parezca aprobar.

    Es la unica parte de la capa que NO es Python, y existe por un hueco muy
    concreto: si `python3` no esta, el hook sale 127, Claude Code lo trata como
    error no bloqueante y la operacion pasa sin revision. Aqui se comprueba que
    ese caso ahora bloquea, y que el envoltorio no se interpone cuando todo
    esta en su sitio.

    El `python3` ausente se simula con un PATH que no lo contiene. No se toca
    la maquina.
    """
    import os
    import shutil
    import tempfile

    fallos = 0
    print("\n=== envoltorio de arranque: python3 ausente NO puede aprobar ===")

    # Un PATH minimo, con las utilidades que el envoltorio necesita pero SIN
    # python3. Se construye enlazando lo indispensable en un directorio nuevo.
    tmp = tempfile.mkdtemp(prefix="sin-python-")
    bin_falso = pathlib.Path(tmp) / "bin"
    bin_falso.mkdir()
    for util in ("bash", "env", "command", "cat"):
        real = shutil.which(util)
        if real:
            try:
                os.symlink(real, bin_falso / util)
            except OSError:
                pass

    entorno_sin_python = dict(os.environ, PATH=str(bin_falso))

    # Guardias que EXISTEN y no pueden decidir. Se construyen aqui para que la
    # suite no dependa de dejar basura en el arbol.
    d = pathlib.Path(tmp)
    rotos = {}
    rotos["sintaxis"] = d / "sintaxis.py"
    rotos["sintaxis"].write_text("def f(:\n    pass\n")
    rotos["no_python"] = d / "no-python.py"
    rotos["no_python"].write_text("#!/bin/sh\necho hola\n")
    rotos["import"] = d / "import-roto.py"
    rotos["import"].write_text("import modulo_que_no_existe\n")
    rotos["codigo3"] = d / "codigo3.py"
    rotos["codigo3"].write_text("import sys\nsys.exit(3)\n")
    rotos["extrana"] = d / "guardia.perl"
    rotos["extrana"].write_text("print 1\n")
    peligroso = json.dumps(con_comando("git push --force origin main"))
    inocuo = json.dumps(con_comando("ls -la"))

    casos = [
        # (nombre, argv, entrada, entorno, exit esperado)
        ("python disponible + comando inocuo",
         [ENVOLTORIO, DESTRUCTIVO], inocuo, None, 0),
        ("python disponible + comando prohibido",
         [ENVOLTORIO, DESTRUCTIVO], peligroso, None, 2),
        ("python AUSENTE + comando inocuo",
         [ENVOLTORIO, DESTRUCTIVO], inocuo, entorno_sin_python, 2),
        ("python AUSENTE + comando prohibido",
         [ENVOLTORIO, DESTRUCTIVO], peligroso, entorno_sin_python, 2),
        ("guardia inexistente",
         [ENVOLTORIO, str(AQUI / "no-existe.py")], inocuo, None, 2),
        ("invocacion sin argumentos",
         [ENVOLTORIO], inocuo, None, 2),
        ("invocacion con dos argumentos",
         [ENVOLTORIO, DESTRUCTIVO, COMMIT], inocuo, None, 2),
        ("ruta de guardia vacia",
         [ENVOLTORIO, "   "], inocuo, None, 2),

        # --- Cuarta ronda. Los encontro la revision de la etapa A y los
        # cuatro PASABAN: comprobar que el guardia EXISTA no basta, porque uno
        # que existe pero no puede decidir sale 1, y 1 tampoco bloquea. El
        # hueco solo se habia movido de «guardia ausente aprueba» a «guardia
        # inservible aprueba».
        ("guardia con error de sintaxis",
         [ENVOLTORIO, str(rotos["sintaxis"])], peligroso, None, 2),
        ("guardia que no es Python",
         [ENVOLTORIO, str(rotos["no_python"])], peligroso, None, 2),
        ("guardia con import roto",
         [ENVOLTORIO, str(rotos["import"])], peligroso, None, 2),
        ("guardia que sale con codigo 3",
         [ENVOLTORIO, str(rotos["codigo3"])], peligroso, None, 2),
        ("extension desconocida",
         [ENVOLTORIO, str(rotos["extrana"])], peligroso, None, 2),

        # El guardia de secretos tambien va envuelto ahora: falla cerrado sin
        # python3, pero NO cubria «el archivo no esta».
        ("guardia de secretos envuelto, escritura inocua",
         [ENVOLTORIO, SECRETOS],
         json.dumps(con_escritura("src/x.js", "const a = 1;\n")), None, 0),
        ("guardia de secretos envuelto, escritura peligrosa",
         [ENVOLTORIO, SECRETOS],
         json.dumps(con_escritura("id_rsa", "x\n")), None, 2),
    ]

    try:
        for nombre, argv, entrada, entorno, esperado in casos:
            r = subprocess.run(argv, input=entrada, capture_output=True,
                               text=True, env=entorno)
            ok = r.returncode == esperado
            fallos += not ok
            marca = "ok   " if ok else "FALLA"
            det = r.stderr.strip().replace("\n", " ")[:44]
            print(f"  {marca} {nombre:<40} exit={r.returncode} {det}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # El guardia de secretos es Bash pero usa python3 para leer el JSON. Su
    # sustitucion de comando ya falla cerrado; se comprueba en vez de suponerlo.
    print("\n=== guardia de secretos sin python3 ===")
    tmp2 = tempfile.mkdtemp(prefix="sin-python2-")
    bin2 = pathlib.Path(tmp2) / "bin"
    bin2.mkdir()
    for util in ("bash", "grep", "cat", "printf", "head", "tail", "sed"):
        real = shutil.which(util)
        if real:
            try:
                os.symlink(real, bin2 / util)
            except OSError:
                pass
    try:
        r = subprocess.run(
            [SECRETOS],
            input=json.dumps(con_escritura("src/x.js", "const a = 1;\n")),
            capture_output=True, text=True,
            env=dict(os.environ, PATH=str(bin2)))
        ok = r.returncode == 2
        fallos += not ok
        marca = "ok   " if ok else "FALLA"
        print(f"  {marca} {'sin python3 debe bloquear':<40} "
              f"exit={r.returncode} {r.stderr.strip()[:44]}")
    finally:
        shutil.rmtree(tmp2, ignore_errors=True)

    return fallos, len(casos) + 1


def probar_commit():
    """Monta un repositorio desechable por caso y corre el guardia contra el."""
    import shutil
    import tempfile
    fallos = 0
    print(f"\n=== guardia-commit: contra un indice real ===")
    base = tempfile.mkdtemp(prefix="probar-commit-")
    try:
        for i, caso in enumerate(COMMIT_CASOS):
            nombre = caso["nombre"]
            debe_bloquear = caso["bloquea"]
            forzar = caso.get("forzar", False)
            etiqueta = re.sub(r"\W+", "_", nombre)
            repo = Path(base) / f"{i:02d}_{etiqueta}"
            repo.mkdir()
            for c in (["init", "-q"], ["config", "user.email", "t@t"],
                      ["config", "user.name", "t"]):
                subprocess.run(["git"] + c, cwd=repo, capture_output=True)

            def escribir(pares, add=True):
                for ruta, contenido in pares:
                    f = repo / ruta
                    f.parent.mkdir(parents=True, exist_ok=True)
                    # bytes para los casos de binario real: un PDF sintetico de
                    # puro texto no ejercita la decodificacion del diff.
                    if isinstance(contenido, bytes):
                        f.write_bytes(contenido)
                    else:
                        f.write_text(contenido)
                    if add:
                        subprocess.run(
                            ["git", "add"] + (["-f"] if forzar else [])
                            + [ruta], cwd=repo, capture_output=True)

            # Historia previa, para los casos que necesitan un HEAD real.
            if caso.get("previo"):
                escribir(caso["previo"])
                subprocess.run(["git", "commit", "-q", "-m", "base"],
                               cwd=repo, capture_output=True)
            escribir(caso.get("archivos", []),
                     add=caso.get("preparar", True))
            for ruta in caso.get("borrar", []):
                subprocess.run(["git", "rm", "-q", "--cached", ruta],
                               cwd=repo, capture_output=True)

            payload = {"tool_input":
                       {"command": caso.get("cmd", 'git commit -m "x"')},
                       "cwd": str(repo)}
            p = subprocess.run([COMMIT], input=json.dumps(payload),
                               capture_output=True, text=True)
            esperado = 2 if debe_bloquear else 0
            ok = p.returncode == esperado
            fallos += not ok
            marca = "ok   " if ok else "FALLA"
            det = p.stderr.strip().replace("\n", " ")[:44]
            print(f"  {marca} {nombre:<40} exit={p.returncode} {det}")
    finally:
        shutil.rmtree(base, ignore_errors=True)
    return fallos, len(COMMIT_CASOS)


def con_comando(c):
    return {"tool_input": {"command": c}}


def con_escritura(ruta, contenido):
    return {"tool_input": {"file_path": ruta, "content": contenido}}


def main():
    resultados = [
        bloque("guardia-destructivo: DEBE BLOQUEAR",
               DESTRUCTIVO_BLOQUEAR, DESTRUCTIVO, con_comando, 2),
        bloque("guardia-destructivo: DEBE PASAR",
               DESTRUCTIVO_PASAR, DESTRUCTIVO, con_comando, 0),
        bloque("guardia-secretos: DEBE BLOQUEAR",
               SECRETOS_BLOQUEAR, SECRETOS, con_escritura, 2),
        bloque("guardia-secretos: DEBE PASAR",
               SECRETOS_PASAR, SECRETOS, con_escritura, 0),
        bloque_crudo("FALLA CERRADO destructivo: entrada rota DEBE BLOQUEAR",
                     CRUDO_BLOQUEAR, DESTRUCTIVO, 2),
        bloque_crudo("FALLA CERRADO destructivo: sin evento DEBE PASAR",
                     CRUDO_PASAR, DESTRUCTIVO, 0),
        bloque_crudo("FALLA CERRADO secretos: entrada rota DEBE BLOQUEAR",
                     CRUDO_SECRETOS_BLOQUEAR, SECRETOS, 2),
        bloque_crudo("FALLA CERRADO secretos: sin evento DEBE PASAR",
                     CRUDO_SECRETOS_PASAR, SECRETOS, 0),
        probar_envoltorio(),
        probar_commit(),
    ]
    fallos = sum(f for f, _ in resultados)
    total = sum(t for _, t in resultados)
    print(f"\n{total - fallos}/{total} casos correctos")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
