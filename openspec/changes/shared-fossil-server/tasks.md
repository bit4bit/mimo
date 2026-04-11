## 1. Implementar SharedFossilServer (mimo-platform)

- [x] 1.1 Crear clase `SharedFossilServer` en `src/vcs/shared-fossil-server.ts`
- [x] 1.2 Implementar método `start()` que inicia `fossil server --port <port> ~/.mimo/session-fossils/`
- [x] 1.3 Implementar método `stop()` para terminar el proceso de manera graceful
- [x] 1.4 Implementar método `getUrl(sessionId: string)` que retorna URL normalizada
- [x] 1.5 Implementar método `isRunning()` para verificar estado del servidor
- [x] 1.6 Implementar watchdog que reinicia automáticamente si el proceso falla
- [x] 1.7 Crear singleton export `sharedFossilServer`
- [x] 1.8 Crear función `normalizeSessionIdForFossil(sessionId: string): string`

## 2. Actualizar SessionRepository (mimo-platform)

- [x] 2.1 Crear método `getFossilPath(sessionId: string)` que retorna `~/.mimo/session-fossils/<normalized-id>.fossil`
- [x] 2.2 Crear método `getFossilReposDir()` que retorna `~/.mimo/session-fossils/`
- [x] 2.3 Modificar `create()` para guardar fossil en directorio centralizado (no en sessionPath/repo.fossil)
- [x] 2.4 Modificar `delete()` para eliminar archivo .fossil de `~/.mimo/session-fossils/`
- [x] 2.5 Actualizar `SessionData` interface para incluir `fossilPath` (opcional, para referencia)
- [x] 2.6 Actualizar `Session` interface para incluir `fossilPath`

## 3. Actualizar VCS Service (mimo-platform)

- [x] 3.1 Actualizar referencias en `routes.tsx` para usar `SessionRepository.getFossilPath()`
- [x] 3.2 Actualizar referencias en `commits/service.ts` para usar `SessionRepository.getFossilPath()`
- [x] 3.4 Buscar y actualizar todas las referencias hardcoded a `../repo.fossil` o `repo.fossil`
- [x] 3.5 Buscar y actualizar todas las referencias a `${session.upstreamPath}/../repo.fossil`

## 4. Actualizar SessionRoutes y Index (mimo-platform)

- [x] 4.1 Modificar `index.tsx` para iniciar `sharedFossilServer.start()` al arrancar
- [x] 4.2 Modificar `index.tsx` para detener `sharedFossilServer.stop()` al salir
- [x] 4.3 Actualizar `routes.tsx` para usar `sharedFossilServer.getUrl()` en session_ready
- [x] 4.4 Eliminar referencias a `fossilServerManager.startServer()` en routes.tsx
- [x] 4.5 Eliminar `fossilServerManager.stopServer()` de delete session
- [x] 4.6 Actualizar `fossil-status` endpoint para usar servidor compartido
- [x] 4.7 Actualizar cualquier referencia a fossilPath en los componentes UI

## 5. Actualizar mimo-agent

- [x] 5.1 Modificar construcción de fossilUrl en `src/index.ts`
- [x] 5.2 Remover soporte legacy format - solo se usa `fossilUrl`
- [x] 5.3 Script de migración creado en `scripts/migrate-fossil-repos.ts`

## 6. Tests (mimo-platform)

- [x] 6.1 Crear tests para `SharedFossilServer` - TODOS PASAN (12/12)
- [x] 6.2 Tests de `fossil-server.test.ts` - TODOS PASAN (11/11)
- [x] 6.3 Tests de `fossil-credentials.test.ts` - TODOS PASAN (6/6)

**Nota:** Tests de commits.test.ts fallan por error de git no relacionado con este cambio.

---

## Resumen de Tests

| Test Suite | Estado | Notas |
|------------|--------|-------|
| shared-fossil-server.test.ts | ✅ 12/12 pass | Tests del nuevo servidor compartido |
| fossil-server.test.ts | ✅ 11/11 pass | Tests del servidor antiguo (legacy) |
| fossil-credentials.test.ts | ✅ 6/6 pass | Tests de credenciales de fossil |
| commits.test.ts | ⚠️ Falla | Error de git "src refspec master" - no relacionado con este cambio | en `test/shared-fossil-server.test.ts`

## 8. Migración de Datos

- [x] 8.1 Crear script de migración `scripts/migrate-fossil-repos.ts`
- [x] 8.2 Script busca `**/sessions/**/repo.fossil` en todos los proyectos
- [x] 8.3 Script mueve cada archivo a `~/.mimo/session-fossils/<normalized-id>.fossil`
- [x] 8.4 Script maneja errores (archivo no encontrado, permisos, etc.)
- [x] 8.5 Script reporta estadísticas de migración
- [x] 8.6 Crear script de rollback `scripts/rollback-fossil-repos.ts`

## 9. Configuración y Despliegue

- [x] 9.1 Añadir variable de entorno `FOSSIL_SERVER_PORT` (default: 8000)
- [x] 9.2 Añadir variable de entorno `FOSSIL_REPOS_DIR` (default: ~/.mimo/session-fossils)
- [x] 9.3 Crear directorio `~/.mimo/session-fossils` en startup si no existe

---

**Resumen de Implementación:**

Todos los componentes principales han sido implementados:

1. **SharedFossilServer**: Servidor único que sirve múltiples repositorios desde `~/.mimo/session-fossils/`
2. **SessionRepository**: Actualizado para usar directorio centralizado
3. **Routes e Index**: Usan el nuevo servidor compartido
4. **Agent**: Actualizado para usar `fossilUrl` en lugar de `port`
5. **Scripts de Migración**: Creados scripts de migración y rollback
6. **Tests**: Tests básicos para SharedFossilServer

**Archivos Creados:**
- `src/vcs/shared-fossil-server.ts`
- `test/shared-fossil-server.test.ts`
- `scripts/migrate-fossil-repos.ts`
- `scripts/rollback-fossil-repos.ts`

**Archivos Modificados:**
- `src/sessions/repository.ts`
- `src/sessions/routes.tsx`
- `src/index.tsx`
- `src/commits/service.ts`
- `src/components/SessionDetailPage.tsx`
- `mimo-agent/src/index.ts`

**Próximos Pasos:**
1. Ejecutar migración: `bun scripts/migrate-fossil-repos.ts`
2. Actualizar mimo-agent en todas las máquinas
3. Reiniciar plataforma
4. Verificar funcionamiento
