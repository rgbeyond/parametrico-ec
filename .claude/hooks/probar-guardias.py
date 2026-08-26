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
   escritura de este mismo archivo.

La alternativa —eximir a este archivo de los guardias— seria una via de escape:
cualquiera podria meter una credencial llamando a su archivo como este. Es mas
sano que el guardia siga siendo estricto y que la prueba se adapte.

ALCANCE: esta suite mide LOS HOOKS, no la politica efectiva. `permissions.deny`
de settings.json bloquea cosas que aqui salen como "pasa" —`rm -rf` de cualquier
ruta, por ejemplo— porque son dos capas distintas. Un 35/35 dice que los hooks
hacen lo suyo, no que la politica completa haga lo que dice.
"""
import json
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
SERVICE_ROLE = "service" + "_role = sbp_abcdefghij0123456789xyz"
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


def correr(hook, payload):
    p = subprocess.run([hook], input=json.dumps(payload),
                       capture_output=True, text=True)
    return p.returncode, p.stderr.strip()


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
    ]
    fallos = sum(f for f, _ in resultados)
    total = sum(t for _, t in resultados)
    print(f"\n{total - fallos}/{total} casos correctos")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
