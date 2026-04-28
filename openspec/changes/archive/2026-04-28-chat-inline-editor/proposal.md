## Why

El chat de sesión tiene un input box separado en la parte inferior que rompe la continuidad visual con las burbujas de mensajes. Reemplazarlo con una burbuja "YOU" editable integrada en el historial mejora la coherencia de la UI y permite escritura multilínea de forma natural.

## What Changes

- **BREAKING** Eliminar el div `#chat-form` (form, input type text, botón Send, span `.chat-connection-status`) del HTML del servidor (`SessionDetailPage.tsx`).
- Crear dinámicamente en `chat.js` una burbuja "YOU" editable con `contenteditable` al final de `#chat-messages`.
- El header de la burbuja editable contiene: label "YOU", indicador de conexión `●` (no clickeable), y botón `[⌃↵ Send]` (clickeable).
- Envío por `Ctrl+Enter` o click en `[⌃↵ Send]`.
- Al enviar: la burbuja editable se convierte en read-only; no aparece nueva burbuja editable hasta recibir `usage_update` del agente.
- En carga inicial: si no hay historial o el último mensaje es del agente, mostrar la burbuja editable inmediatamente.
- Si el último mensaje del historial es del usuario (agente aún procesando): no mostrar editable hasta `usage_update`.
- Handler de `paste` para convertir contenido enriquecido a texto plano.
- Eliminar la función `setupChatInput()` y referencias al selector `#chat-input`.

## Capabilities

### New Capabilities

- `chat-inline-editor`: Burbuja "YOU" editable con contenteditable, envío por Ctrl+Enter o click, indicador de conexión en el header, y ciclo de vida ligado a las respuestas del agente.

### Modified Capabilities

<!-- Sin cambios en specs existentes -->

## Impact

- `packages/mimo-platform/src/components/SessionDetailPage.tsx`: eliminar el bloque `#chat-form` del JSX y los estilos `.chat-input` asociados.
- `packages/mimo-platform/public/js/chat.js`: reemplazar `setupChatInput()`, mover lógica de conexión status, añadir `createEditableBubble()`, modificar `endMessageStream()` y `loadChatHistory()`.
- Sin cambios en el servidor (HTTP/WebSocket), base de datos, ni dependencias externas.
- El fallback HTTP (`sendMessageHttp`) se conserva, adaptado al nuevo flujo.
