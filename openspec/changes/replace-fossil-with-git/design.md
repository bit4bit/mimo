# Design: Replace Fossil with Git

## Topología (se conserva la arquitectura actual)

Tres repositorios por sesión, igual que hoy con Fossil. Solo cambian los comandos y el formato.

```
Host de la plataforma                       Host del agente (REMOTO en producción)
─────────────────────                       ─────────────────────────────────────
reposDir/<sid>.git   (bare)  ◄── git push ── checkout del agente (edita)
   servido por git-http-backend                     ▲
   (HTTP + basic-auth)                              │ git clone (HTTP + auth)
                                                    │
agentWorkspacePath/  (checkout propio de la plataforma)
   git clone/pull por ruta LOCAL (mismo host, sin HTTP)
   la plataforma lee ESTE dir para impact/preview/diff
```

Claves confirmadas en el código actual:
- Los agentes son **remotos** en producción → no hay filesystem compartido.
- `agentWorkspacePath` es el checkout **de la plataforma** (no el del agente). Se refresca con `fossil up` tras el push (`auto-commit.ts:195`).
- El push del agente lo dispara la plataforma vía `sync_now` (request/response), no es espontáneo.
- El commit hacia upstream es **copia de archivos** a un checkout separado (`upstreamPath`) + `git push`; no depende de la capa de sesión. No cambia.

## Decisión 1: `git http-backend` por spawn, sin dependencia npm

`git http-backend` es el CGI smart-HTTP nativo de Git. Se lanza con el mismo `os.command.spawn` ya usado para `fossil server`. Evita la dependencia `git-http-backend` (sin mantenimiento desde ~2015) y respeta las reglas de DI del repo.

Variables de entorno requeridas en cada invocación CGI:
- `GIT_PROJECT_ROOT=<reposDir>`
- `GIT_HTTP_EXPORT_ALL=1` (servir sin archivo `git-daemon-export-ok` por repo)
- `PATH_INFO`, `REQUEST_METHOD`, `QUERY_STRING`, `CONTENT_TYPE`, etc., derivados de la request HTTP entrante.
- Para aceptar push: `http.receivepack=true` en cada repo bare (`git config http.receivepack true`).

El servidor HTTP (un solo listener, como el `SharedFossilServer` actual) parsea la request, autentica (Decisión 2), arma el entorno CGI, hace `spawn(["git", "http-backend"])`, escribe el body en stdin y hace pipe de stdout a la response.

## Decisión 2: Basic-auth, mismo modelo que hoy

Hoy las credenciales por sesión van embebidas en la URL del remoto Fossil (`http://user:pass@host/<sid>/`). Se mantiene:
- El agente recibe `agentWorkspaceUser` / `agentWorkspacePassword` y los embebe en la URL del remoto Git: `git push http://user:pass@host/<sid>.git`.
- El front HTTP valida `Authorization: Basic` antes de lanzar el CGI y autoriza qué sesión puede tocar qué repo (gate por `<sid>`).
- El verificador de credenciales reutiliza el mismo store/lógica que el modelo Fossil actual.

## Decisión 3: Repo de sesión **bare**

El repo servido solo es destino de push + fuente de clone/pull. **Nadie lee su working tree** (la plataforma lee su checkout separado `agentWorkspacePath`). Por tanto:
- `reposDir/<sid>.git` es **bare**.
- No se necesita `receive.denyCurrentBranch=updateInstead` ni working tree en el repo servido.
- El checkout de la plataforma clona/pull desde el repo bare por **ruta local** (mismo host) — sin HTTP ni auth.

## Decisión 4: Seed sin conversión

| Upstream | Seed del repo de sesión |
|---|---|
| Git (caso común) | `git clone --bare <upstream-o-cache> reposDir/<sid>.git` (+ rama). Sin conversión de historial. |
| Fossil (raro) | Puente mínimo de una sola vez: `fossil export --git` → `git fast-import` al repo bare. La capa de sesión queda siempre en Git. |

Tras crear el repo bare: `git config http.receivepack true`, y `git clone <ruta-local-bare> agentWorkspacePath` para el checkout de la plataforma.

`.mimoignore`: Fossil lo fusionaba en `.fossil-settings/ignore-glob`. Git no tiene equivalente de archivo versionado equivalente; fusionar patrones `.mimoignore` en `.git/info/exclude` (o un `.gitignore` gestionado) en el seed. `.gitignore` del upstream es nativo.

## Decisión 5: Sync-back del agente simplificado

`handleSyncNow` (disparado por `sync_now`):

```
git add -A                    # nuevos + borrados + dotfiles, respeta .gitignore
git status --porcelain        # vacío → responder noChanges:true (preservar contrato)
git commit -m "agent-sync(<sid>): <ts>"
git push origin <branch>      # → repo bare de la plataforma
```

Bloques que desaparecen frente a Fossil:
- Reintento binario-como-texto (Git guarda binarios nativamente).
- Resolución de conflictos de merge (solo el agente escribe el repo de sesión → historial lineal → push siempre fast-forward).

**Invariante** que habilita el borrado del manejo de conflictos: la plataforma nunca commitea al repo de sesión; solo lee `agentWorkspacePath` y refresca con `pull --ff-only`. Verificado: preview lee `agentWorkspacePath`, copy-back escribe `upstreamPath`, ambos separados.

## Decisión 6: Refresh de la plataforma tras el push

En `auto-commit.ts`, tras `sync_now_result{success, !noChanges}`:

```
git -C agentWorkspacePath pull --ff-only   # reemplaza openFossil + fossilUp
sccService.invalidateCache(agentWorkspacePath)
```

`--ff-only` falla ruidosamente si por algún bug el historial diverge, en vez de crear merges silenciosos.

## Mapa de comandos

| Operación | Fossil | Git |
|---|---|---|
| servidor | `fossil server --port N <dir>` | listener HTTP + `spawn(git http-backend)` por request |
| repo de sesión | `<sid>.fossil` | `<sid>.git` bare |
| seed (git upstream) | `fossil import --git` | `git clone --bare` |
| seed (fossil upstream) | `fossil import --git` | `fossil export --git \| git fast-import` |
| clone del agente | `fossil clone <url>` + `open` | `git clone <url>` |
| stage | `fossil addremove --dotfiles` | `git add -A` |
| ¿cambios? | `fossil changes` | `git status --porcelain` |
| commit | `fossil commit ...` | `git commit -m` |
| push agente→plataforma | `fossil push` | `git push origin <branch>` |
| refresh plataforma | `openFossil` + `fossil up` | `git pull --ff-only` |
| push upstream | `git push` / `fossil push` | sin cambios |
| ignore | `.fossil-settings/ignore-glob` | `.gitignore` / `.git/info/exclude` |

## Riesgos / a validar en implementación

1. **Auth del CGI**: confirmar que el front basic-auth + `GIT_HTTP_EXPORT_ALL=1` + `http.receivepack=true` permiten clone y push autenticados. Spike mínimo antes de cablear todo.
2. **`pull --ff-only` con árbol sucio**: el checkout de la plataforma no debe ensuciarse entre syncs. Verificar que nada escribe `agentWorkspacePath` salvo el pull.
3. **Credenciales en URL**: Git puede warnear con `user:pass@` en la URL; aceptable (igual que Fossil hoy). Alternativa: `http.extraHeader` Authorization si molesta en logs.
4. **`.mimoignore`**: asegurar paridad de exclusión vs el `ignore-glob` actual.
5. **Migración de sesiones vivas**: sesiones existentes en `.fossil` no migran automáticamente. Definir política (drenar/recrear vs script de migración) — fuera de alcance de esta capa, pero anotar.

## Open questions

- ¿Mantener soporte de upstream Fossil (Decisión 4, fila 2) o deprecarlo? Recomendación: mantener el puente mínimo para no romper proyectos fossil-upstream existentes.
- Política para sesiones `.fossil` activas durante el deploy.
