## ADDED Requirements

### Requirement: Servidor Fossil compartido expone múltiples repositorios
El sistema DEBE mantener un único proceso `fossil server` que sirve múltiples repositorios desde un directorio centralizado.

#### Scenario: Servidor inicia con repositorios existentes
- **WHEN** la plataforma inicia
- **AND** existen repositorios en `~/.mimo/session-fossils/`
- **THEN** el sistema inicia `fossil server --port 8000 ~/.mimo/session-fossils/`
- **AND** el servidor expone cada repositorio como `http://localhost:8000/<normalized-session-id>.fossil/`

#### Scenario: Nuevo repositorio se crea en directorio centralizado
- **WHEN** se crea una nueva sesión con id "abc123-def456-ghi789"
- **THEN** el sistema importa el upstream a `~/.mimo/session-fossils/abc123_def456_ghi789.fossil`
- **AND** el repositorio está accesible vía `http://localhost:8000/abc123_def456_ghi789.fossil/`

#### Scenario: Repositorio se elimina del directorio centralizado
- **WHEN** se elimina una sesión con id "abc123-def456-ghi789"
- **THEN** el sistema elimina el archivo `~/.mimo/session-fossils/abc123_def456_ghi789.fossil`
- **AND** el directorio de sesión (upstream/, agent-workspace/) se elimina por separado

### Requirement: Servidor Fossil compartido acepta autenticación por usuario
El sistema DEBE crear usuarios únicos para cada sesión que permitan el acceso autenticado al repositorio compartido.

#### Scenario: Usuario de sesión autentica contra servidor compartido
- **WHEN** el agente ejecuta `fossil sync` contra `http://localhost:8000/<session-id>.fossil/`
- **AND** proporciona credenciales `agent-<session-short-id>` y `<password>`
- **THEN** el servidor Fossil autentica al usuario
- **AND** permite el sync solo si el usuario tiene permisos sobre ese repositorio

### Requirement: Servidor compartido mantiene alta disponibilidad
El sistema DEBE monitorear y reiniciar automáticamente el servidor Fossil compartido si falla.

#### Scenario: Servidor compartido se reinicia tras fallo
- **WHEN** el proceso `fossil server` termina inesperadamente
- **THEN** el sistema detecta la terminación del proceso
- **AND** el sistema espera 2 segundos
- **AND** el sistema reinicia el servidor Fossil en el mismo puerto
- **AND** el sistema registra el reinicio en logs

## REMOVED Requirements (de versiones anteriores de fossil-server)

### Requirement: Servidor Fossil por sesión
**Reason**: Reemplazado por servidor compartido que gestiona múltiples repositorios desde un directorio centralizado
**Migration**: Eliminar FossilServerManager. Usar SharedFossilServer en su lugar.

### Requirement: Asignación dinámica de puertos (8000-9000)
**Reason**: Solo se usa un puerto fijo para el servidor compartido
**Migration**: Configurar FOSSIL_SERVER_PORT (default: 8000)

### Requirement: Repo.fossil en directorio de sesión
**Reason**: Todos los repositorios se centralizan en ~/.mimo/session-fossils/ para simplificar gestión
**Migration**: Actualizar código que referencia `sessionPath/repo.fossil` a usar `getFossilPath(sessionId)`
