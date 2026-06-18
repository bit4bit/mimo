## ADDED Requirements

### Requirement: Seed del repositorio de sesión usa Git nativo

El sistema MUST inicializar el repositorio de sesión con Git nativo, sin convertir historial a Fossil.

#### Scenario: Upstream Git se siembra sin conversión

- **WHEN** se crea una sesión sobre un proyecto con `repoType = "git"`
- **THEN** el sistema crea `reposDir/<sid>.git` bare a partir del upstream (clone/fetch)
- **AND** no ejecuta ninguna conversión `fossil import`

#### Scenario: Upstream Fossil se siembra vía puente a Git

- **WHEN** se crea una sesión sobre un proyecto con `repoType = "fossil"`
- **THEN** el sistema exporta el historial con `fossil export --git` hacia `git fast-import` en el repo bare
- **AND** la capa de sesión queda en Git

#### Scenario: Patrones de exclusión se trasladan a Git

- **WHEN** se siembra el repositorio de sesión
- **THEN** el sistema fusiona los patrones de `.mimoignore` en `.git/info/exclude`
- **AND** respeta el `.gitignore` del upstream de forma nativa

### Requirement: La plataforma refresca su checkout tras el push del agente

El sistema MUST refrescar el checkout propio de la plataforma (`agentWorkspacePath`) con Git tras un sync exitoso del agente.

#### Scenario: Refresh fast-forward tras sync con cambios

- **WHEN** el agente responde `sync_now_result` con `success` y sin `noChanges`
- **THEN** el sistema ejecuta `git pull --ff-only` en `agentWorkspacePath`
- **AND** invalida la cache de impacto para esa ruta
- **AND** si el historial divergiera, el pull falla de forma ruidosa en vez de crear un merge

#### Scenario: Sin cambios no dispara refresh

- **WHEN** el agente responde `sync_now_result` con `noChanges`
- **THEN** el sistema no ejecuta pull ni invalida cache

## MODIFIED Requirements

### Requirement: El repositorio de sesión se almacena como Git bare

El sistema MUST almacenar cada repositorio de sesión como `reposDir/<sid>.git` bare en vez de `<sid>.fossil`.

#### Scenario: Creación de repositorio de sesión

- **WHEN** se crea una sesión con id `<sid>`
- **THEN** el sistema crea `reposDir/<sid>.git` bare
- **AND** clona ese repo bare por ruta local hacia `agentWorkspacePath` (checkout de la plataforma)

#### Scenario: Eliminación de repositorio de sesión

- **WHEN** se elimina una sesión con id `<sid>`
- **THEN** el sistema elimina `reposDir/<sid>.git`
- **AND** elimina por separado `agentWorkspacePath` y `upstreamPath`
