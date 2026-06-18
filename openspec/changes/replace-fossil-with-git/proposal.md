## Why

La capa de versionado interna entre `mimo-platform` y `mimo-agent` usa Fossil. El upstream del usuario suele ser Git, así que cada importación de proyecto ejecuta `fossil import --git` para convertir todo el historial Git → Fossil. Esa conversión es lenta y crece con el tamaño del repositorio. Además mantiene un proceso `fossil server` de larga vida con watchdog/reinicio, reglas de URL propias de Fossil (`-` no permitido, normalización `session-id` → `session_id`), y ~95 líneas de manejo de reintentos (binarios-como-texto, conflictos de merge) en la ruta de sync del agente.

Reemplazar Fossil por Git nativo, sirviendo los repositorios de sesión con el CGI `git http-backend`, elimina la conversión, alinea la herramienta con el upstream (que ya es Git) y simplifica la ruta de sync.

## What Changes

- **Nuevo**: `git http-backend` (CGI nativo de Git, lanzado con `spawn`) sirve los repositorios de sesión por HTTP. Sin dependencia npm.
- **Nuevo**: Front de basic-auth delante del CGI, con el mismo modelo de credenciales por sesión que hoy (usuario/contraseña embebidos en la URL del remoto).
- **Modificado**: Repositorio de sesión pasa de `reposDir/<sid>.fossil` a `reposDir/<sid>.git` **bare**.
- **Modificado**: Seed del repositorio de sesión: de `fossil import --git` a `git` nativo (clone/fetch del upstream). Elimina la conversión de historial.
- **Modificado**: `mimo-agent` clona/sincroniza con `git clone` / `git add -A && git commit && git push` en vez de comandos `fossil`.
- **Modificado**: Refresh del checkout de la plataforma tras el push del agente: `fossil up` → `git pull --ff-only`.
- **Eliminado**: `SharedFossilServer`, `FossilServerManager`, `normalizeSessionIdForFossil`, reintentos de binarios/conflictos en `handleSyncNow`, watchdog/reinicio del servidor.

## Capabilities

### New Capabilities

- `git-session-server`: Servidor HTTP que expone repositorios Git de sesión vía `git http-backend` con basic-auth por sesión.

### Modified Capabilities

- `session-management`: El repositorio de sesión es Git bare; el seed usa Git nativo sin conversión Fossil.
- `agent-lifecycle`: El agente clona y sincroniza con comandos Git.

### Removed Capabilities

- `shared-fossil-server`: Reemplazado por `git-session-server`.

## Impact

- **mimo-platform/src/domain/vcs/index.ts**: Reemplazar comandos `fossil` por `git` (seed, open, clone, sync, commit, history, push). Centralizar construcción de comandos Git.
- **mimo-platform/src/domain/vcs/shared-fossil-server.ts**: Reemplazar `SharedFossilServer` por `GitHttpServer` (spawn de `git http-backend`).
- **mimo-platform/src/domain/vcs/server.ts**: Eliminar `FossilServerManager` (muerto).
- **mimo-platform/src/api/rest/auto-commit.ts**: `openFossil`+`fossilUp` → `git pull --ff-only` sobre `agentWorkspacePath`.
- **mimo-platform/src/domain/projects/vcs-cache.ts**: Cache de clones por Git.
- **mimo-platform/src/domain/impact/scc-service.ts**: `.fossil-settings/ignore-glob` → `.gitignore` / `.git/info/exclude`.
- **mimo-platform/scripts/rollback-fossil-repos.ts**: Obsoleto.
- **mimo-agent/src/index.ts**: `setupCheckout` (~230 líneas duplicadas) → un solo camino Git (clone-si-ausente / pull); `handleSyncNow` → `git add -A` / commit / push (sin reintentos de binarios/conflictos).
- **mimo-agent/src/session.ts**: Limpieza de `.fossil` → `.git`.
- **Tests**: ~30 archivos referencian `fossil`; actualizar a Git.
- **Invariante a preservar**: solo el agente escribe commits en el repo de sesión; la plataforma solo lee/refresca. Mantiene historial lineal (push siempre fast-forward).
