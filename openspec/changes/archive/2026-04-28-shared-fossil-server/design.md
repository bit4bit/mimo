## Context

**Arquitectura Actual:**
```
┌─────────────────────────────────────────────────────────────────┐
│              ARQUITECTURA ACTUAL - 1 Proceso por Sesión          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Session A: Port 8001 (~15MB)                                  │
│   Session B: Port 8002 (~15MB)                                  │
│   Session C: Port 8003 (~15MB)                                  │
│   ...                                                           │
│   Session N: Port 800N (~15MB)                                  │
│                                                                 │
│   Problemas:                                                   │
│   • 100 sesiones = 1.5GB RAM                                    │
│   • Límite de 1000 puertos (8000-9000)                          │
│   • Complejidad de gestión de puertos                          │
│   • Cada proceso independiente = overhead                        │
└─────────────────────────────────────────────────────────────────┘
```

**Arquitectura Propuesta (Sin Symlinks):**
```
┌─────────────────────────────────────────────────────────────────┐
│           ARQUITECTURA PROPUESTA - Servidor Compartido            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ~/.mimo/session-fossils/                                         │
│   ├── abc123_def456.fossil    ← archivo real                   │
│   ├── def789_ghi012.fossil    ← archivo real                   │
│   └── jkl345_mno678.fossil    ← archivo real                   │
│                                                                 │
│   ~/.mimo/projects/project-123/sessions/                          │
│   └── abc123-def456-ghi789/                                     │
│       ├── upstream/                 (git clone)                 │
│       ├── agent-workspace/          (checkout de fossil)        │
│       └── session.yaml              (sin repo.fossil local)    │
│                                                                 │
│   ┌──────────────────────────────────────────────────────────┐│
│   │              Shared Fossil Server (Port 8000)              ││
│   │                    (~20MB total)                          ││
│   │                                                            ││
│   │   /abc123_def456.fossil  ──► abc123_def456.fossil         ││
│   │   /def789_ghi012.fossil  ──► def789_ghi012.fossil         ││
│   │   /jkl345_mno678.fossil  ──► jkl345_mno678.fossil         ││
│   └──────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Goals / Non-Goals

**Goals:**
- Reducir memoria de 15MB × N sesiones a ~20MB constantes
- Eliminar el límite artificial de ~1000 sesiones por rango de puertos
- Simplificar gestión: un solo proceso en lugar de N
- Mantener compatibilidad HTTP para agentes remotos
- Reducir complejidad del código (eliminar lógica de puertos)
- **NUEVO**: Guardar repo.fossil en directorio centralizado (sin symlinks)

**Non-Goals:**
- Cambiar el protocolo de sincronización (se mantiene HTTP)
- Modificar el checkout local del agente (se mantiene igual)
- Soporte para múltiples servidores Fossil (uno por instancia de plataforma)
- Optimizar throughput de sync (no es bottleneck actual)

## Decisions

### Decision 1: Guardar repo.fossil en directorio centralizado

**Elegido:** Guardar todos los `repo.fossil` en `~/.mimo/session-fossils/` directamente, sin symlinks.

**Alternativa considerada:** Crear symlinks desde un directorio centralizado al repo.fossil en cada session directory.

**Rationale:**
- **Simplicidad:** Un solo lugar donde está el archivo, sin indirección
- **No depende de symlinks:** Funciona en todos los filesystems (incluyendo Windows)
- **Backup más simple:** Los archivos .fossil están todos juntos
- **Menos operaciones:** Solo crear/mover archivo, no crear session + crear symlink

**Trade-offs:**
- El `repo.fossil` no está "cerca" de los otros archivos de la sesión (upstream/, agent-workspace/)
- Hay que actualizar referencias en el código que asumen `repo.fossil` está en `sessionPath/`

**Paths actualizados:**
- Antes: `~/.mimo/projects/<project>/sessions/<session>/repo.fossil`
- Después: `~/.mimo/session-fossils/<normalized-session-id>.fossil`

### Decision 2: Normalizar session IDs para nombres de archivo

**Elegido:** Reemplazar guiones con underscores en los nombres de archivo `.fossil`.

**Rationale:**
Fossil tiene restricciones estrictas en los nombres de archivo para el path de URL:
- No permite `-` después de `/`
- El punto debe estar rodeado de caracteres alfanuméricos

`abc123-def456-ghi789` → `abc123_def456_ghi789.fossil`

**Ejemplo:**
- Session ID: `ses-abc123-def456-ghi789-jkl012`
- Archivo: `~/.mimo/session-fossils/ses_abc123_def456_ghi789_jkl012.fossil`
- URL: `http://localhost:8000/ses_abc123_def456_ghi789_jkl012.fossil/`

### Decision 3: Puerto fijo configurado por variable de entorno

**Elegido:** Usar `FOSSIL_SERVER_PORT` con default 8000.

**Rationale:**
- Simplicidad: no hay que asignar dinámicamente
- Predecibilidad: agente y plataforma saben el puerto
- Configuración explícita: si hay conflicto, el operador cambia la variable

**Alternativa considerada:** Buscar puerto disponible dinámicamente.
**Rechazada:** Añade complejidad innecesaria. El operador puede configurar el puerto explícitamente.

### Decision 4: Servidor como Singleton global en la plataforma

**Elegido:** El servidor se inicia una vez cuando la plataforma arranca y se detiene cuando termina.

**Rationale:**
- **Vida del servidor ≠ vida de las sesiones:** El servidor debe estar disponible para cualquier sesión en cualquier momento
- **Simplicidad:** No hay que iniciar/detener por sesión
- **Alta disponibilidad:** Si el servidor falla, se reinicia automáticamente

**Responsabilidades:**
- `SharedFossilServer`: Gestiona el proceso fossil server (singleton)
- `SessionRepository`: Crea repo.fossil en `~/.mimo/session-fossils/` durante create()
- `SessionRoutes`: Usa la URL compartida en lugar de URLs con puertos individuales

### Decision 5: Cambios en mimo-agent (coordinado)

**Elegido:** Actualizar la construcción de fossilUrl en el agente para incluir el path del repositorio.

**Cambios necesarios:**
```typescript
// Antes:
const fossilUrl = `http://${platformHost.split(":")[0]}:${port}/`;

// Después:
const fossilUrl = `http://${platformHost.split(":")[0]}:${port}/${sessionId}.fossil/`;
```

**Coordinación:**
Este cambio debe desplegarse coordinadamente:
1. Actualizar mimo-agent para soportar nuevo formato de URL
2. Desplegar mimo-platform con servidor compartido
3. Agentes nuevos usarán automáticamente el nuevo formato

**Backwards compatibility:**
- Antiguo: `http://host:8001/` → Nuevo: `http://host:8000/session-id.fossil/`
- No hay forma de mantener compatibilidad retroactiva simple
- Requiere actualización coordinada de ambos componentes

## Risks / Trade-offs

### [Riesgo] Coordinación de despliegue plataforma-agente
**Mitigación:** Desplegar durante ventana de mantenimiento. Documentar que ambos deben actualizarse juntos.

### [Riesgo] Single point of failure (un solo proceso)
**Mitigación:** Implementar watchdog que reinicia automáticamente el servidor si falla.

### [Riesgo] URL encoding de session IDs
**Mitigación:** Usar función consistente `normalizeSessionIdForFossil()` tanto en plataforma como en agente.

### [Riesgo] Migración de sesiones existentes
**Mitigación:** Script de migración que mueve `repo.fossil` existentes al nuevo directorio y renombra según formato normalizado.

### [Trade-off] Separación física de archivos
**Análisis:** El `repo.fossil` ya no está en el mismo directorio que `upstream/` y `agent-workspace/`. Esto puede hacer debugging más difícil, pero mejora la organización.

### [Trade-off] Complejidad de migración
**Análisis:** Hay que actualizar todas las referencias al path de `repo.fossil`. Requiere búsqueda cuidadosa de hardcoded paths en el código.

## Implementation Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SHARED FOSSIL SERVER ARCHITECTURE              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Platform Startup                                               │
│  ┌─────────────────┐                                           │
│  │ index.tsx       │                                           │
│  │                 │                                           │
│  │ sharedServer    │──┐                                       │
│  │   .start()      │  │                                       │
│  │                 │  │                                       │
│  └─────────────────┘  │                                        │
│                      │                                         │
│  ┌───────────────────▼──────────┐                             │
│  │ SharedFossilServer            │                             │
│  │  - spawns fossil server       │                             │
│  │  - monitors process           │                             │
│  │  - restarts on failure        │                             │
│  │  - provides getUrl(sessionId) │                             │
│  └──────────┬────────────────────┘                             │
│             │                                                   │
│  Session Lifecycle                                              │
│             │                                                   │
│  ┌──────────▼──────────┐                                        │
│  │ SessionRepository   │                                        │
│  │                     │                                        │
│  │ create()            │──► Guarda fossil en ~/.mimo/session-fossils/│
│  │ delete()            │──► Elimina fossil de ~/.mimo/session-fossils/│
│  │ getFossilPath()     │──► Retorna path en ~/.mimo/session-fossils/│
│  │                     │                                        │
│  └─────────────────────┘                                        │
│                              ~/.mimo/session-fossils/              │
│                              ├── abc_def.fossil                │
│                              └── xyz_def.fossil                │
│                                                                 │
│  Agent Communication                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ session_ready message:                                   │   │
│  │ {                                                        │   │
│  │   sessions: [{                                           │   │
│  │     sessionId: "abc-...",                                │   │
│  │     fossilUrl: "http://host:8000/abc_....fossil/",        │   │
│  │     agentWorkspaceUser,                                  │   │
│  │     agentWorkspacePassword                               │   │
│  │   }]                                                     │   │
│  │ }                                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Migration Plan

### Fase 1: Preparación
1. Crear `SharedFossilServer` clase
2. Actualizar `SessionRepository` para usar nuevo path de fossil
3. Crear script de migración para mover sesiones existentes
4. Añadir tests para nuevo comportamiento

### Fase 2: Actualización de Agente
1. Actualizar `mimo-agent` para construir URLs con formato nuevo
2. Desplegar nueva versión del agente

### Fase 3: Activación del Servidor Compartido
1. Ejecutar script de migración para sesiones existentes
2. Configurar `FOSSIL_SERVER_PORT` en plataforma
3. Activar `sharedServer.start()` en `index.tsx`
4. Actualizar `SessionRoutes` para usar URLs de servidor compartido
5. Deprecar y eliminar `FossilServerManager`

### Rollback Strategy
- Revertir a `FossilServerManager` original
- Script de rollback que mueve archivos .fossil de vuelta a session directories

## Open Questions

1. **¿Qué pasa si el servidor Fossil compartido se bloquea mientras hay syncs activos?**
   - Mitigación: El watchdog reinicia el servidor
   - El agente tiene retry logic en fossil sync
   - Posible pérdida de transacciones en curso (aceptable)

2. **¿Necesitamos rate limiting o throttling en el servidor compartido?**
   - Análisis: Cada repositorio Fossil tiene su propio locking
   - No parece necesario inicialmente
   - Monitorear para decidir si se añade

3. **¿Cómo manejamos el caso de session ID duplicados en el directorio centralizado?**
   - Los session IDs son UUIDs únicos, no debería haber duplicados
   - Si ocurre, lanzar error y no sobrescribir
