## ADDED Requirements

### Requirement: Servidor Git de sesión expone repositorios vía git http-backend

El sistema MUST servir los repositorios de sesión por HTTP usando el CGI `git http-backend` lanzado por proceso, sin dependencia npm externa.

#### Scenario: Servidor inicia y sirve repositorios existentes

- **WHEN** la plataforma inicia
- **AND** existen repositorios bare en `reposDir/`
- **THEN** el sistema inicia un único listener HTTP
- **AND** cada petición Git smart-HTTP se atiende lanzando `git http-backend` con `GIT_PROJECT_ROOT=reposDir` y `GIT_HTTP_EXPORT_ALL=1`
- **AND** cada repositorio es accesible como `http://<host>:<port>/<sid>.git/`

#### Scenario: Repositorio de sesión es bare y acepta push

- **WHEN** se crea el repositorio de una sesión
- **THEN** el sistema crea `reposDir/<sid>.git` como repositorio **bare**
- **AND** configura `http.receivepack=true` en ese repositorio
- **AND** el working tree del repositorio servido no es leído por ningún componente de la plataforma

#### Scenario: Clientes acceden por el id de sesión sin normalización

- **WHEN** una sesión tiene id "abc123-def456-ghi789"
- **THEN** el repositorio es accesible como `http://<host>:<port>/abc123-def456-ghi789.git/`
- **AND** el sistema NO aplica normalización de guiones a underscores

### Requirement: Servidor Git de sesión autentica por basic-auth por sesión

El sistema MUST validar credenciales basic-auth por sesión antes de lanzar el CGI y autorizar el acceso solo al repositorio de esa sesión.

#### Scenario: Agente autenticado clona y sincroniza

- **WHEN** el agente ejecuta `git clone`/`git push` contra `http://<user>:<pass>@<host>:<port>/<sid>.git/`
- **THEN** el front HTTP valida la cabecera `Authorization: Basic`
- **AND** autoriza la operación solo si las credenciales corresponden a `<sid>`
- **AND** lanza `git http-backend` solo tras autorizar

#### Scenario: Credenciales inválidas son rechazadas

- **WHEN** una petición llega sin credenciales válidas para `<sid>`
- **THEN** el sistema responde `401`
- **AND** no lanza el CGI

## REMOVED Requirements

### Requirement: Servidor Fossil compartido expone múltiples repositorios

**Reason**: Reemplazado por `git-session-server` (git http-backend).
**Migration**: Los repositorios `<sid>.fossil` se sustituyen por `<sid>.git` bare; ver tasks de migración.

### Requirement: Servidor Fossil compartido acepta autenticación por usuario

**Reason**: Reemplazado por basic-auth del `git-session-server` con el mismo modelo de credenciales por sesión.

### Requirement: Servidor compartido mantiene alta disponibilidad

**Reason**: El modelo CGI por petición no mantiene proceso de larga vida; se elimina watchdog/reinicio.
