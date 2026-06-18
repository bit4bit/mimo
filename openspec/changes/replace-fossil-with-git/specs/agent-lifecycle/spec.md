## MODIFIED Requirements

### Requirement: El agente clona el repositorio de sesión con Git

El agente MUST obtener el workspace de la sesión clonando el repositorio Git servido por la plataforma, autenticando por basic-auth.

#### Scenario: Clone inicial de la sesión

- **WHEN** el agente recibe `session_ready` con la URL del repositorio de sesión
- **AND** no existe checkout local
- **THEN** el agente ejecuta `git clone http://<user>:<pass>@<host>:<port>/<sid>.git` hacia su checkout
- **AND** hace checkout de la rama indicada si se especifica

#### Scenario: Checkout existente se actualiza

- **WHEN** el agente recibe `session_ready`
- **AND** ya existe el checkout local
- **THEN** el agente ejecuta `git pull` para actualizar
- **AND** no vuelve a clonar

### Requirement: El agente sincroniza cambios con Git

El agente MUST responder a `sync_now` haciendo stage, commit y push de los cambios del checkout con Git.

#### Scenario: Sync con cambios

- **WHEN** la plataforma envía `sync_now`
- **AND** el checkout del agente tiene cambios
- **THEN** el agente ejecuta `git add -A`
- **AND** `git commit -m "agent-sync(<sid>): <timestamp>"`
- **AND** `git push origin <branch>`
- **AND** responde `sync_now_result` con `success`

#### Scenario: Sync sin cambios

- **WHEN** la plataforma envía `sync_now`
- **AND** `git status --porcelain` está vacío
- **THEN** el agente responde `sync_now_result` con `noChanges: true`
- **AND** no crea commit ni push

#### Scenario: Archivos binarios se sincronizan sin tratamiento especial

- **WHEN** el checkout contiene archivos binarios modificados
- **THEN** el agente los incluye en el commit normalmente
- **AND** no aplica lógica de reintento por "binary data"

## REMOVED Requirements

### Requirement: El agente resuelve conflictos de merge durante el sync

**Reason**: Solo el agente escribe el repositorio de sesión; el historial es lineal y el push siempre es fast-forward. La ruta de resolución de conflictos deja de aplicar.
**Migration**: Ninguna; la plataforma solo lee/refresca con `git pull --ff-only`.
