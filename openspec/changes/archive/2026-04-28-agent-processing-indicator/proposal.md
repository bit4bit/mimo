## Why

Cuando el usuario envía un mensaje en la página de sesión, no existe feedback visual de que el proveedor (mimo-agent) lo recibió. El único indicador aparece cuando llega `thought_start` — que puede tardar varios segundos — dejando al usuario sin saber si el mensaje fue entregado al agente.

## What Changes

- El agente (`mimo-agent`) emite un nuevo evento `prompt_received` inmediatamente al recibir un `user_message` y confirmar que tiene un cliente ACP activo para la sesión.
- El platform reenvía `prompt_received` a todos los chat clients conectados a esa sesión.
- El chat UI crea el elemento de mensaje del agente de forma anticipada con un indicador "⟳ Recibido, procesando..." en cuanto llega `prompt_received`.
- Ese mismo elemento evoluciona en lugar de crear uno nuevo: primero el indicador de espera, luego "Thinking..." con `thought_start`, luego la respuesta con `message_chunk`.

## Capabilities

### New Capabilities

- `agent-processing-feedback`: Señal de confirmación del agente al recibir un mensaje del usuario, y la evolución del elemento de mensaje en el UI desde "procesando" hasta la respuesta completa.

### Modified Capabilities

<!-- No hay cambios en requisitos de specs existentes -->

## Impact

- `packages/mimo-agent/src/index.ts`: agrega envío de `prompt_received` en `handleUserMessage()`
- `packages/mimo-platform/src/index.tsx`: agrega case `prompt_received` en `handleAgentMessage()`
- `packages/mimo-platform/public/js/chat.js`: nuevo handler `prompt_received`, y modificación de `startThoughtSection()` / `appendMessageChunk()` para reutilizar el elemento existente
- Sin cambios en APIs HTTP, base de datos, ni dependencias externas
