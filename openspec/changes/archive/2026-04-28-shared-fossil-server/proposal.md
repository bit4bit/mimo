## Why

Actualmente, mimo-platform inicia un proceso fossil server dedicado por cada agent-workspace activo. Cada proceso consume ~15MB de RAM y un puerto TCP. Con 100 sesiones activas, esto consume 1.5GB+ de RAM solo para los servidores Fossil. Además, el rango de puertos 8000-9000 limita el sistema a ~1000 sesiones concurrentes.

## What Changes

- **Nuevo**: Servidor Fossil compartido que sirve múltiples repositorios desde un solo proceso
- **Modificado**: `fossil-server.ts` - reemplazar FossilServerManager con SharedFossilServer
- **Modificado**: Estructura de directorios - todos los `repo.fossil` se moverán a un directorio centralizado
- **Modificado**: URLs de acceso - de `http://localhost:<port>/` a `http://localhost:<port>/<repo-name>.fossil/`
- **Modificado**: Agente (`mimo-agent`) - actualizar URL construction para incluir el nombre del repositorio
- **Eliminado**: Lógica de asignación dinámica de puertos, mapeo session→port, limpieza de puertos

## Capabilities

### New Capabilities
- `shared-fossil-server`: Servidor Fossil único que expone múltiples repositorios vía URL pathname

### Modified Capabilities
- `session-management`: Sesiones ya no almacenan `port` individual. El port es global para todos.
- `agent-communication`: Agente construye URLs con formato `http://host:port/session-id.fossil/`

## Impact

- **mimo-platform/src/vcs/fossil-server.ts**: Reemplazo completo del manager actual
- **mimo-platform/src/sessions/routes.tsx**: Eliminar referencias a session.port, simplificar cleanup
- **mimo-platform/src/index.tsx**: Iniciar servidor compartido al arrancar, detener al salir
- **mimo-agent/src/index.ts**: Actualizar construcción de fossilUrl para incluir nombre de repo
- **Tests**: Actualizar tests de fossil-server para usar arquitectura compartida
- **Memoria**: Reducción de ~15MB × N sesiones a ~20MB constantes
- **Puertos**: Solo se usa un puerto (ej: 8000) independientemente del número de sesiones
