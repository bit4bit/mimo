## 1. mimo-agent: emitir prompt_received

- [x] 1.1 En `packages/mimo-agent/src/index.ts`, en `handleUserMessage()`, añadir `this.send({ type: 'prompt_received', sessionId, timestamp: new Date().toISOString() })` justo antes de llamar `acpClient.prompt(content)` (solo cuando acpClient existe)

## 2. Platform: reenviar prompt_received a chat clients

- [x] 2.1 En `packages/mimo-platform/src/index.tsx`, en `handleAgentMessage()`, añadir un nuevo `case "prompt_received"` que haga broadcast del evento a todos los chat WebSocket clients de `data.sessionId`

## 3. Chat UI: indicador de espera en el elemento del agente

- [x] 3.1 En `packages/mimo-platform/public/js/chat.js`, crear la función `createWaitingAgentMessage()` que construye el elemento DOM del mensaje Agent con el indicador `● Recibido, procesando...` (usando clase `streaming` y animación `blink`), lo agrega al chat y lo asigna a `currentMessageElement`
- [x] 3.2 Añadir `case 'prompt_received':` en `handleWebSocketMessage()` que llama a `createWaitingAgentMessage()`
- [x] 3.3 Modificar `startThoughtSection()`: si `currentMessageElement` ya existe, buscar y eliminar el indicador de espera dentro de él antes de agregar la sección de thought, en lugar de crear un nuevo elemento
- [x] 3.4 Modificar `appendMessageChunk()`: si `currentMessageElement` ya existe, reutilizarlo en lugar de crear un nuevo elemento Agent
- [x] 3.5 Modificar el handler de `error` en `handleWebSocketMessage()`: si `currentMessageElement` existe, removerlo del DOM y resetear `currentMessageElement = null` antes de mostrar el error

## 4. Verificación

- [x] 4.1 Verificar que al enviar un mensaje con agente conectado, aparece el indicador de espera antes del "Thinking..."
- [x] 4.2 Verificar que el elemento no se duplica: un solo elemento Agent evoluciona de espera → pensando → respuesta
- [x] 4.3 Verificar que sin agente conectado, no aparece el indicador (comportamiento existente preservado)
- [x] 4.4 Verificar que un error del agente limpia el indicador correctamente
