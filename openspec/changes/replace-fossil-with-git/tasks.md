## 1. Spike de validación (git http-backend + auth)

- [x] 1.1 Spike: listener HTTP que lanza `git http-backend` con `GIT_PROJECT_ROOT` y `GIT_HTTP_EXPORT_ALL=1`
- [x] 1.2 Validar `git clone` autenticado (basic-auth) contra un repo bare servido
- [x] 1.3 Validar `git push` autenticado con `http.receivepack=true`
- [x] 1.4 Confirmar política de credenciales en URL (`user:pass@`) vs `http.extraHeader` → URL embebida funciona; sin `http.extraHeader`

## 2. GitHttpServer (mimo-platform)

- [x] 2.1 Crear `GitHttpServer` en `src/domain/vcs/` (un listener, spawn CGI por request) con DI de `OS`
- [x] 2.2 Parseo de request → entorno CGI (`PATH_INFO`, `REQUEST_METHOD`, `QUERY_STRING`, `CONTENT_TYPE`)
- [x] 2.3 Front basic-auth: validar `Authorization` y autorizar por `<sid>` antes de lanzar el CGI; `401` si falla
- [ ] 2.4 Reutilizar el store/verificador de credenciales de sesión actual (verifier inyectado; cablear en mimo-context)
- [x] 2.5 Pipe de body→stdin y stdout→response; manejo de errores del CGI
- [ ] 2.6 Arranque/parada integrados en el ciclo de vida del servidor (reemplazar start/stop de SharedFossilServer)
- [ ] 2.7 Eliminar `SharedFossilServer`, `normalizeSessionIdForFossil`, watchdog/reinicio
- [ ] 2.8 Eliminar `FossilServerManager` (`src/domain/vcs/server.ts`)

## 3. Repositorio de sesión y seed (mimo-platform)

Orquestación real del seed: `web/features/sessions/pages/sessions.tsx` pasos 1-5.5
(clone→branch→importToFossil→createFossilUser→openFossil→syncIgnores).

- [x] 3.1 `getSessionRepoPath(sid)` añadido → `reposDir/<sid>.git` (orquestación y refresh lo usan)
- [x] 3.2 VCS `seedSessionRepo(upstreamPath, repoType, repoPath, branch?)`: crea bare `<sid>.git` + `git config http.receivepack true` (reemplaza `importToFossil`)
- [x] 3.3 Seed upstream Git: `git clone --bare <upstreamPath>` (preserva historial; sin `fossil import`)
- [x] 3.4 Seed upstream Fossil: snapshot single-commit vía plumbing (`write-tree`/`commit-tree`) excluyendo internals fossil (parity con `importToFossil`)
- [x] 3.5 VCS `clonePlatformCheckout(repoPath, agentWorkspacePath, branch?)`: `git clone` ruta local → checkout de plataforma (reemplaza `openFossil`)
- [x] 3.6 VCS `syncIgnoresToGit`: fusionar `.mimoignore` en `.git/info/exclude`; respetar `.gitignore` (reemplaza `syncIgnoresToFossil`)
- [x] 3.7 `delete()` elimina `<sid>.git` (rm recursivo)
- [x] 3.8 Orquestación ya no llama `createFossilUser`: auth vía verifier; el seed solo genera y guarda user/pass
- [x] 3.9 (cache de proyecto) `GitCacheEngine` conservado; `FossilCacheEngine` solo upstream fossil

## 4. VCS service Git (mimo-platform)

- [x] 4.1 Nuevos métodos git (`seedSessionRepo`/`clonePlatformCheckout`/`gitPull`/`syncIgnoresToGit`); orquestación, auto-commit, message-router, sessions.tsx migrados
- [x] 4.2 Construcción de comandos git centralizada en los métodos VCS; agente con un solo camino
- [x] 4.3 `pushUpstream` (ya soporta Git) y copy-back sin cambios
- [x] 4.4 `generatePatch`/`detectChangedFiles` sobre `agentWorkspacePath` vs `upstreamPath` sin cambios (paridad)

## 5. Refresh de la plataforma (mimo-platform)

- [x] 5.1 En `auto-commit.ts`, reemplazar `openFossil`+`fossilUp` por `clonePlatformCheckout`+`gitPull --ff-only` en `agentWorkspacePath`
- [x] 5.2 Conservar `sccService.invalidateCache` tras el refresh
- [x] 5.3 Reemplazar chequeo de `.fslckout` por `.git`

## 6. Impacto / exclusiones (mimo-platform)

- [ ] 6.1 `scc-service.ts`: lectura de `.fossil-settings/ignore-glob` ahora muerta (warn inocuo); `.gitignore`/`.mimoignore` ya se leen — limpieza opcional
- [x] 6.2 `vcs-cache.ts`: `GitCacheEngine` ya existe y se conserva; `FossilCacheEngine` solo para upstream fossil

## 7. Agente (mimo-agent)

- [x] 7.1 `setupCheckout`: un solo camino — `git clone` si ausente, `git pull` si existe (eliminada duplicación)
- [x] 7.2 Credenciales basic-auth embebidas en la URL del remoto (`buildAuthenticatedUrl`)
- [x] 7.3 `handleSyncNow`: `git add -A` → `git status --porcelain` → `git commit` → `git push origin HEAD`
- [x] 7.4 Eliminar reintentos de binarios y resolución de conflictos
- [x] 7.5 Preservar contrato `sync_now_result` (`success`, `noChanges`, `error`)
- [x] 7.6 Limpieza de sesión: `.git` en vez de `.fossil` (`session.ts`)

## 8. Limpieza y tests

- [~] 8.1 Eliminado runtime fossil: `SharedFossilServer`/`DummySharedFossilServer` (+ test), `dev-workspace-user-migration` (+ test), `agent-bootstrap-integration` test (flujo fossil), `scripts/rollback-fossil-repos.ts`, `sessionRepository.getFossilPath`+`normalizeSessionIdForFossil`. **Retenido como follow-up**: `FossilServerManager` (`vcs/server.ts`) y métodos fossil de VCS (`importToFossil`/`openFossil`/`createFossilRepo`/`fossilUp`/`syncIgnoresToFossil`/`importGitToFossil`/`cloneFossil`) — siguen respaldando fixtures de `vcs.test.ts`/`commits.test.ts`/`patch-sync.test.ts`/`session-bootstrap.test.ts`; su borrado requiere reescribir esos fixtures a git
- [x] 8.2 Actualizar tests que referencian `fossil` (unit) — suite verde
- [x] 8.3 Test: seed Git sin conversión (`vcs-git-session.test.ts`)
- [x] 8.4 Test: ciclo seed→checkout→push agente→`gitPull --ff-only` (`vcs-git-session.test.ts`)
- [x] 8.5 Test: basic-auth rechaza credenciales inválidas (`401`) (`git-http-server.test.ts`)
- [x] 8.6 `bun test` verde en ambos paquetes (platform 1072 pass / 1 fail pre-existente no relacionado; agent 155 pass). `test.full` (integration) pendiente
- [x] 2.4 Verifier basic-auth cableado en `mimo-context` contra creds de sesión
- [x] 2.6 `GitHttpServer` arranca en el ciclo de vida (`index.tsx` + `bootstrap.tsx`)

## 9. Migración / despliegue

- [x] 9.1 Scripts de migración forward-only (sin rollback), uno por paquete por límite de host:
  - `mimo-platform/scripts/migrate-fossil-to-git.ts`: re-seed `<sid>.git` (`--dissociate`) + re-clone checkout + rm `<sid>.fossil` + drop `cache.fossil`; idempotente + `--dry-run`
  - `mimo-agent/scripts/migrate-fossil-to-git.ts`: borra checkouts fossil obsoletos + `<sid>.fossil` para que el agente re-clone vía git; `--dry-run` + `--workdir`
  - Self-heal en `setupCheckout`: limpia checkout no-git no-vacío antes de `git clone`
  - Runbook: drenar→sync(old)→deploy→platform migrate→agent migrate (cambios sin sincronizar se pierden)
- [x] 9.2 Verificar invariante: la plataforma nunca commitea al repo de sesión (preview lee `agentWorkspacePath`, copy-back escribe `upstreamPath`; sesión solo `pull --ff-only`)
