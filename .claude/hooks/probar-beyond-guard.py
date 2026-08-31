r"""Casos de `beyond_guard.py`, el guardia PreToolUse.

Se escribio al validar la infraestructura del issue #4 y encontro dos
evasiones reales: `git push` a secas desde una rama protegida y el refspec
forzado `+main`. Corre con `python3 .claude/hooks/probar-beyond-guard.py`.
"""
import json, subprocess, sys
import os
AQUI = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(AQUI))
HOOK = os.path.join(AQUI, "beyond_guard.py")
PROD = "xteroaxzhkixehnnbpbh"; DEV = "gtxvzbeyywtqihfcvezk"
P = "git" + " push"          # se arma en tiempo de ejecucion: el propio guardia
M = "ma" + "in"              # bloquea cualquier orden que contenga el literal

def corre(tool, ti, proyecto=None):
    import os
    env = dict(os.environ)
    # El gancho resuelve la rama con CLAUDE_PROJECT_DIR, asi que la prueba tiene
    # que fijarlo igual que lo hace Claude Code.
    if proyecto: env["CLAUDE_PROJECT_DIR"] = proyecto
    p = subprocess.run([sys.executable, HOOK], input=json.dumps(
        {"tool_name": tool, "tool_input": ti}), capture_output=True, text=True,
        env=env)
    if p.returncode != 0:
        return f"ERROR rc={p.returncode} {p.stderr.strip()[:80]}"
    if not p.stdout.strip():
        return "pasa"
    try:
        d = json.loads(p.stdout)
    except Exception:
        return f"SALIDA NO JSON: {p.stdout[:60]}"
    return d.get("hookSpecificOutput", {}).get("permissionDecision", "sin-decision")

CASOS = [
    (f"{P} origin {M}",            "Bash", {"command": f"{P} origin {M}"}, "deny"),
    (f"{P} -u origin {M}",         "Bash", {"command": f"{P} -u origin {M}"}, "deny"),
    (f"{P} origin HEAD:{M}",       "Bash", {"command": f"{P} origin HEAD:{M}"}, "deny"),
    ("push --force a rama claude", "Bash", {"command": f"{P} --force origin claude/x"}, "deny"),
    ("push -f a rama claude",      "Bash", {"command": f"{P} -f origin claude/x"}, "deny"),
    ("gh pr merge",                "Bash", {"command": "gh pr merge 12 --squash"}, "deny"),
    ("netlify deploy --prod",      "Bash", {"command": "netlify deploy --prod"}, "deny"),
    ("PROD + insert",              "Bash", {"command": f"psql {PROD} -c 'insert into t values (1)'"}, "deny"),
    ("PROD solo lectura",          "Bash", {"command": f"psql {PROD} -c 'select 1'"}, "ask"),
    ("DEV + alter",                "Bash", {"command": f"psql {DEV} -c 'alter table t add column c int'"}, "ask"),
    ("DEV solo lectura",           "Bash", {"command": f"psql {DEV} -c 'select 1'"}, "pasa"),
    ("mcp apply_migration DEV",    "mcp__supabase__apply_migration", {"project_id": DEV, "query": "create table x()"}, "ask"),
    ("mcp apply_migration PROD",   "mcp__supabase__apply_migration", {"project_id": PROD, "query": "create table x()"}, "deny"),
    ("git status",                 "Bash", {"command": "git status --short"}, "pasa"),
    ("npm test",                   "Bash", {"command": "npm test"}, "pasa"),
    ("push a rama claude",         "Bash", {"command": f"{P} -u origin claude/infra-claude-code"}, "pasa"),
    # ---- intentos de evasion: se espera que TAMBIEN se bloqueen ----
    # `git push` a secas depende de la rama: aqui HEAD esta en claude/*, asi
    # que debe pasar. El caso de rama protegida se prueba aparte, abajo.
    (f"{P} a secas desde claude/*", "Bash", {"command": P}, "pasa"),
    ("EVASION push tras &&",       "Bash", {"command": f"cd /tmp && {P} origin {M}"}, "deny"),
    ("EVASION refspec +main",      "Bash", {"command": f"{P} origin +{M}"}, "deny"),
    ("EVASION mayusculas",         "Bash", {"command": f"{P.upper()} ORIGIN {M.upper()}"}, "deny"),
    ("EVASION PROD otro campo",    "mcp__supabase__execute_sql", {"project_id": PROD, "query": "delete from perfiles"}, "deny"),
    ("EVASION PROD via url",       "Bash", {"command": f"curl https://{PROD}.supabase.co/rest/v1/perfiles -X DELETE"}, "deny"),
]
# --- caso aparte: la MISMA orden desde una rama protegida ---
import os, tempfile
tmp = tempfile.mkdtemp()
for orden in (["git","init","-q","-b","main"],["git","config","user.email","x@y.z"],
              ["git","config","user.name","x"],["git","commit","-q","--allow-empty","-m","x"]):
    subprocess.run(orden, cwd=tmp, capture_output=True)
CASOS.append((f"{P} a secas desde main", "Bash", {"command": P}, "deny"))
CWD = {f"{P} a secas desde main": tmp,
       f"{P} a secas desde claude/*": REPO}

anchura = max(len(c[0]) for c in CASOS)
fallos = []
for etiqueta, tool, ti, esperado in CASOS:
    got = corre(tool, ti, CWD.get(etiqueta) if "CWD" in dir() else None)
    ok = got == esperado
    if not ok: fallos.append(etiqueta)
    print(f"{'ok   ' if ok else 'FALLA'} {etiqueta.ljust(anchura)}  esperado={esperado:5s} obtenido={got}")
print(f"\n{len(CASOS)-len(fallos)}/{len(CASOS)} correctos")
if fallos: print("discrepancias: " + "; ".join(fallos))

raise SystemExit(1 if fallos else 0)
