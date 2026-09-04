#!/usr/bin/env python3
"""PreToolUse sobre Bash — revisa lo que ESTA EN EL INDICE antes de un commit.

Por que hace falta si ya hay dos guardias
------------------------------------------
`guardia-secretos.sh` mira lo que Claude escribe con Edit o Write.
`guardia-destructivo.py` mira el texto del comando.

Ninguno de los dos ve lo que ya esta preparado en el indice. Un archivo puede
llegar ahi de muchas formas que no pasan por esos dos: `git add -A` arrastrando
algo que se creo fuera de Claude, un `git stash pop`, un merge, un archivo que
alguien puso a mano. El commit es el ultimo punto donde se puede mirar el
contenido real antes de que entre a la historia, y de la historia ya no sale.

Que bloquea
-----------
1. Archivos de entorno y material de llave privada preparados.
2. `.claude/settings.local.json`, que son permisos personales: comitearlos los
   ensancha para todo el equipo en silencio.
3. Credenciales dentro del diff preparado, con los mismos detectores que el
   guardia de secretos.
4. **PDF de cliente NUEVOS** bajo las rutas del corpus protegido.

El punto 4 tiene un matiz que importa: se mira solo lo que se AGREGA. Los 57 PDF
que ya estan versionados no se tocan -esa decision esta tomada y documentada en
docs/arquitectura/adr-0006-corpus-de-recibos.md-. Lo que este guardia impide es
que entre uno NUEVO en silencio. El corpus existente es deuda conocida; uno
nuevo seria deuda nueva, y esa si se puede evitar hoy.

Lo que este guardia NO ve, y conviene saberlo
----------------------------------------------
- **Contenido binario.** `git diff` no emite el cuerpo de un blob binario, solo
  «Binary files differ». Los detectores de credenciales no lo alcanzan. Lo que
  si alcanza es el NOMBRE del archivo, y por eso las reglas de ruta importan mas
  que los detectores de contenido.
- **Un PDF de cliente guardado fuera de las rutas del corpus.** La proteccion es
  por ruta; nadie puede reconocer un recibo por su contenido de forma barata.

FALLA CERRADO. Si no puede leer su entrada o no puede consultar el indice, no
aprueba: un control que no sabe lo que esta pasando no puede decir que si.

Contrato: exit 0 deja pasar; exit 2 bloquea y stderr le explica a Claude.
"""
import importlib.util
import json
import os
import re
import shlex
import subprocess
import sys

# El analizador de comandos vive en el guardia destructivo. Se reutiliza en vez
# de reimplementarlo: la primera version partia el comando con un `re.split`
# propio y por eso `bash -c "git commit ..."` le pasaba por delante sin que
# nadie mirara el indice. Dos analizadores distintos divergen; uno solo, no.
#
# El nombre del archivo lleva guion, asi que no se puede importar con `import`.
_ruta_destructivo = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                 "guardia-destructivo.py")


def _cargar_analizador():
    spec = importlib.util.spec_from_file_location("guardia_destructivo",
                                                  _ruta_destructivo)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.subcomandos, mod.desenvolver


# Rutas cuyo contenido nuevo no entra al repositorio sin decision explicita.
CORPUS_PROTEGIDO = re.compile(r'^casos/(recibos|expedientes)/', re.I)
EXT_DOCUMENTO_CLIENTE = re.compile(r'\.(pdf|jpe?g|png|tiff?)$', re.I)

ARCHIVOS_PROHIBIDOS = [
    (re.compile(r'(^|/)\.env(?!\.example|\.template|\.sample|\.ejemplo)'
                r'(\.[A-Za-z0-9_-]+)*$'),
     "es un archivo de entorno: lleva credenciales y nunca entra al "
     "repositorio. La plantilla .env.example si"),
    (re.compile(r'(^|/)\.claude/settings\.local\.json$'),
     "son permisos personales aprobados sobre la marcha; comitearlos los "
     "ensancha para todo el equipo en silencio"),
    (re.compile(r'(^|/)(id_rsa|id_ed25519)$|\.(pem|p12|pfx|key)$'),
     "es material de llave privada"),
]

DETECTORES = [
    (re.compile(r'eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}'),
     "algo con forma de JWT"),
    (re.compile(r'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY'),
     "una llave privada"),
    (re.compile(r'\b(sbp_[A-Za-z0-9]{20,}|sb_(secret|publishable)_[A-Za-z0-9_-]{16,}'
                r'|nfp_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}'
                r'|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})'),
     "un token con prefijo de proveedor"),
    (re.compile(r'\b[A-Z][A-Z0-9_]*(TOKEN|SECRET|PASSWORD|APIKEY|API_KEY)'
                r'[A-Z0-9_]*\s*[:=]\s*["\']?[A-Za-z0-9/+_.-]{32,}'),
     "la asignacion de una credencial con su valor"),
]

ES_COMMIT = re.compile(r'^(sudo\s+)?git\s+(-[^\s]+\s+|--[^\s]+\s+)*commit\b',
                       re.I)

# `git commit -a` prepara los archivos rastreados JUSTO ANTES de comitear, o
# sea DESPUES de que este hook corre. Mirar solo `--cached` deja fuera
# exactamente lo que ese commit va a guardar, y `-am "..."` es la forma mas
# comun de comitear que existe. Cuando aparece, se revisa tambien el arbol de
# trabajo de los archivos rastreados.
#
# `--amend` empieza por `--`, asi que el lookbehind lo excluye de la forma
# corta, y `--all\b` no casa con `--amend`.
COMMIT_TODO = re.compile(r'-[a-zA-Z]*a[a-zA-Z]*$')


def git(args, cwd):
    # `errors="replace"` NO es un detalle. Un binario real preparado -un PDF de
    # verdad, no el "%PDF-1.4" sintetico de la suite- puede llevar bytes que no
    # son UTF-8 dentro del diff, y con la decodificacion estricta el guardia
    # reventaba con UnicodeDecodeError. Fallaba cerrado, que es el lado bueno,
    # pero con el mensaje equivocado -"el guardia fallo"- y bloqueando tambien
    # commits LEGITIMOS con cualquier binario en el indice. Lo encontro el
    # ensayo con un recibo real al portar los guardias a Solar.
    return subprocess.run(["git"] + args, cwd=cwd, capture_output=True,
                          text=True, errors="replace", timeout=30)


def revisar_indice(cwd, incluye_arbol=False):
    """Devuelve la lista de motivos por los que este commit no debe pasar.

    `incluye_arbol` es para `git commit -a`: ese commit prepara los archivos
    rastreados despues de que corre el hook, asi que el indice todavia no los
    tiene. Comparar contra HEAD en vez de contra el indice cubre las dos cosas
    -lo ya preparado y lo que `-a` va a preparar- de una sola pasada.
    """
    motivos = []

    # Sin `--diff-filter`. La version anterior traia ACMR, que excluye D, y una
    # BAJA preparada del corpus pasaba sin que nadie la viera: borrar los
    # recibos de regresion es justo una de las cosas que el corpus protegido
    # existe para impedir. Aqui se listan todos los estados y el filtro se
    # aplica despues, donde se sabe que significa cada uno.
    ambito = ["HEAD"] if incluye_arbol else ["--cached"]
    r = git(["diff"] + ambito + ["--name-status"], cwd)
    if r.returncode != 0 and incluye_arbol:
        # Repositorio sin ningun commit: HEAD no resuelve. Se cae al indice.
        ambito = ["--cached"]
        r = git(["diff"] + ambito + ["--name-status"], cwd)
    if r.returncode != 0:
        # No se pudo leer el indice. No es un repositorio, o git fallo. En los
        # dos casos, el guardia no sabe que se va a comitear.
        return [f"no se pudo leer el indice ({r.stderr.strip()[:120]}). El "
                f"guardia no puede aprobar un commit cuyo contenido no logro "
                f"revisar"]

    agregados, rutas, bajas = [], [], []
    for linea in r.stdout.splitlines():
        partes = linea.split("\t")
        if len(partes) < 2:
            continue
        estado, ruta = partes[0], partes[-1]
        rutas.append(ruta)
        if estado.startswith("A"):
            agregados.append(ruta)
        elif estado.startswith("D"):
            bajas.append(ruta)

    if not rutas:
        return []                        # nada preparado: no hay que juzgar

    for ruta in rutas:
        for patron, razon in ARCHIVOS_PROHIBIDOS:
            if patron.search(ruta):
                motivos.append(f"'{ruta}' {razon}")

    # Documentos de cliente NUEVOS bajo el corpus protegido.
    #
    # Se bloquea CUALQUIER archivo nuevo bajo esas rutas, no solo los de
    # extension conocida. Filtrar por `.pdf` invitaba a la evasion mas boba que
    # hay -renombrar a `.dat`- y ademas el corpus no deberia recibir archivos
    # nuevos de ningun tipo sin decision explicita. EXT_DOCUMENTO_CLIENTE se
    # conserva solo para redactar un mensaje mas preciso.
    nuevos = [r_ for r_ in agregados if CORPUS_PROTEGIDO.search(r_)]
    if nuevos:
        lista = ", ".join(nuevos[:5])
        mas = f" y {len(nuevos) - 5} mas" if len(nuevos) > 5 else ""
        que = ("documentos de cliente"
               if any(EXT_DOCUMENTO_CLIENTE.search(r_) for r_ in nuevos)
               else "archivos")
        motivos.append(
            f"entrarian {que} NUEVOS al corpus protegido: {lista}{mas}. Los "
            f"que ya estan versionados se quedan por decision documentada en "
            f"adr-0006, pero uno nuevo si se puede evitar: el camino es una "
            f"fijacion anonimizada, que es lo que describe el skill "
            f"learn-cfe-case")

    # BAJAS del corpus. El ADR-0006 dice que el corpus existente no se toca; una
    # eliminacion preparada es lo contrario de eso y hasta hoy pasaba invisible,
    # porque el filtro ACMR excluia la D.
    bajas_corpus = [r_ for r_ in bajas if CORPUS_PROTEGIDO.search(r_)]
    if bajas_corpus:
        lista = ", ".join(bajas_corpus[:5])
        mas = (f" y {len(bajas_corpus) - 5} mas"
               if len(bajas_corpus) > 5 else "")
        motivos.append(
            f"este commit BORRA del corpus de regresion: {lista}{mas}. Ese "
            f"corpus es la unica prueba de que el extractor sigue leyendo los "
            f"recibos reales; su destino esta decidido en adr-0006 y no se "
            f"cambia de paso en un commit")

    # Contenido preparado. Se pide el diff completo una sola vez.
    d = git(["diff"] + ambito + ["--unified=0"], cwd)
    if d.returncode != 0:
        return motivos + ["no se pudo leer el contenido preparado; el guardia "
                          "no aprueba lo que no reviso"]
    agregado = "\n".join(l[1:] for l in d.stdout.splitlines()
                         if l.startswith("+") and not l.startswith("+++"))
    for patron, que in DETECTORES:
        if patron.search(agregado):
            motivos.append(f"el contenido preparado trae {que}")

    return motivos


# Banderas de `git commit` que consumen el argumento que viene detras. Sin esta
# lista, un mensaje como `git commit -m "quita -a del script"` haria creer que
# el commit lleva -a: el lexer ya quito las comillas y el texto del mensaje
# queda suelto entre los tokens. No es un fallo de seguridad -revisar de mas
# nunca aprueba de menos- pero bloquearia commits legitimos, y un guardia que
# molesta sin razon es un guardia que alguien acaba apagando.
CON_ARGUMENTO = {"-m", "--message", "-F", "--file", "-C", "--reuse-message",
                 "-c", "--reedit-message", "--author", "--date",
                 "--cleanup", "--fixup", "--squash",
                 "--pathspec-from-file", "-t", "--template"}
# `-S` y `--gpg-sign` NO estan en la lista a proposito: su argumento es
# opcional y va pegado (`-Skeyid`). Tratarlos como que consumen el siguiente
# token se tragaria un `-a` que viniera detras.


def prepara_todo(subcomando):
    """Este `git commit`, prepara los archivos rastreados por su cuenta?"""
    try:
        tokens = shlex.split(subcomando)
    except ValueError:
        return True                    # ilegible: se revisa de mas, no de menos
    saltar = False
    for tk in tokens:
        if saltar:
            saltar = False
            continue
        if tk == "--":
            break                      # de aqui en adelante son rutas
        base = tk.split("=", 1)[0]
        if base in CON_ARGUMENTO:
            saltar = "=" not in tk
            continue
        if not tk.startswith("-"):
            continue                   # ruta, o el propio `git` / `commit`
        if tk == "--all" or COMMIT_TODO.match(tk):
            return True
    return False


def main():
    crudo = sys.stdin.read()
    if not crudo.strip():
        return 0

    try:
        entrada = json.loads(crudo)
    except (json.JSONDecodeError, ValueError) as e:
        print(f"BLOQUEADO: el guardia de commit no pudo leer su entrada ({e}).",
              file=sys.stderr)
        return 2
    if not isinstance(entrada, dict):
        print("BLOQUEADO: la entrada del guardia no es un objeto JSON.",
              file=sys.stderr)
        return 2

    ti = entrada.get("tool_input")
    if ti is None:
        return 0
    if not isinstance(ti, dict):
        print("BLOQUEADO: tool_input no es un objeto.", file=sys.stderr)
        return 2
    cmd = ti.get("command")
    if not isinstance(cmd, str) or not cmd.strip():
        return 0                          # sin comando: no es un commit

    # Solo interesa `git commit`. Cualquier otra cosa la ven los otros guardias.
    #
    # Se usa el mismo analizador que el guardia destructivo. Un `re.split` sobre
    # `&&` y `;` no ve dentro de un `bash -c "..."`, y ese era el hueco: el
    # comando entraba envuelto, este guardia no reconocia ningun commit y salia
    # 0 sin haber mirado el indice.
    try:
        subcomandos, desenvolver = _cargar_analizador()
    except Exception as e:                              # noqa: BLE001
        print(f"BLOQUEADO: no se pudo cargar el analizador de comandos de "
              f"guardia-destructivo.py ({type(e).__name__}: {e}). Sin el, este "
              f"guardia no sabe si esto es un commit. Corre "
              f".claude/hooks/probar-guardias.py.", file=sys.stderr)
        return 2

    try:
        trozos = []
        for sub in subcomandos(cmd):
            trozos.extend(desenvolver(sub))
    except Exception as e:                              # noqa: BLE001
        print(f"BLOQUEADO: no se pudo analizar el comando "
              f"({type(e).__name__}: {e}).", file=sys.stderr)
        return 2

    commits = [t for t in trozos if ES_COMMIT.match(t.strip())]
    if not commits:
        return 0

    # `-a` / `-am` / `--all`: hay que mirar tambien el arbol de trabajo.
    incluye_arbol = any(prepara_todo(t) for t in commits)

    # QUE REPOSITORIO se va a comitear. Esto no es un detalle: el `cwd` del
    # evento es el de la SESION, y un `git -C <otra-ruta> commit` comitea en
    # otro sitio. La primera version usaba solo el cwd y reviso el indice del
    # repositorio equivocado —lo descubrimos porque bloqueo un commit legitimo
    # citando contenido de un repo distinto—. Un guardia que revisa el indice
    # que no es, no protege el que si es.
    cwd = entrada.get("cwd") or os.getcwd()
    for t in commits:
        m = re.search(r'(?:^|\s)-C\s+(\S+)', t)
        if m:
            destino = m.group(1).strip('"\'')
            cwd = destino if os.path.isabs(destino) \
                else os.path.join(cwd, destino)
            break
    try:
        motivos = revisar_indice(cwd, incluye_arbol=incluye_arbol)
    except Exception as e:                              # noqa: BLE001
        print(f"BLOQUEADO: el guardia de commit fallo al revisar el indice "
              f"({type(e).__name__}: {e}). No aprueba lo que no reviso.",
              file=sys.stderr)
        return 2

    if motivos:
        print("BLOQUEADO: este commit no puede pasar.", file=sys.stderr)
        for m in motivos:
            print(f"  - {m}", file=sys.stderr)
        print("  Saca esos archivos del indice con `git restore --staged "
              "<ruta>` y vuelve a intentar.", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
