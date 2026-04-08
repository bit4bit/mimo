## 1. Eliminar el form del servidor

- [x] 1.1 En `packages/mimo-platform/src/components/SessionDetailPage.tsx`, eliminar el div `#chat-form` completo (form, input, button Send, span `.chat-connection-status`) y el div `#chat-usage`
- [x] 1.2 En los estilos inline de `SessionDetailPage.tsx`, eliminar la regla `.chat-input` y `.chat-input form` y `.chat-input input`

## 2. Crear la función `createEditableBubble()` en chat.js

- [x] 2.1 Crear la función `createEditableBubble()` que construye el elemento DOM de la burbuja YOU editable: div `.message.message-user` con header (`YOU`, `●` status indicator, separador, botón `[⌃↵ Send]`) y un div `.message-content[contenteditable="true"]` con placeholder
- [x] 2.2 Añadir handler `keydown` en el contenteditable: `Ctrl+Enter` llama a `submitEditableBubble()`; `Enter` solo inserta newline (comportamiento nativo del contenteditable)
- [x] 2.3 Añadir handler `click` en el botón `[⌃↵ Send]` que llama a `submitEditableBubble()`
- [x] 2.4 Añadir handler `paste` que hace `preventDefault()` e inserta `event.clipboardData.getData('text/plain')` como texto plano

## 3. Crear la función `submitEditableBubble()`

- [x] 3.1 Crear `submitEditableBubble()` que: lee `innerText` del contenteditable, hace trim, retorna si está vacío, convierte la burbuja editable a read-only (elimina `contenteditable`, elimina el header con controles), añade el mensaje a `pendingUserMessages`, y envía por WebSocket (`send_message`) o HTTP fallback
- [x] 3.2 Guardar referencia al div de la burbuja editable en una variable `editableBubble` (module-level) para que `submitEditableBubble` pueda encontrarla sin depender de querySelector frágil

## 4. Actualizar `showConnectionStatus()` para apuntar al nuevo indicador

- [x] 4.1 Reescribir `showConnectionStatus()` para buscar el `●` dentro de la burbuja editable (selector `.editable-bubble-status`). Si no existe (burbuja no visible), el update es silencioso — no lanzar error

## 5. Reemplazar `setupChatInput()` con el nuevo flujo

- [x] 5.1 Eliminar la función `setupChatInput()` completa
- [x] 5.2 En `initChat()`, reemplazar la llamada a `setupChatInput()` por una llamada a `createEditableBubble()` (se llamará también desde `endMessageStream()` y `loadChatHistory()`)

## 6. Integrar el ciclo de vida de la burbuja con el agente

- [x] 6.1 En `endMessageStream()`, al final (después de limpiar estado), llamar `createEditableBubble()`
- [x] 6.2 En `loadChatHistory()`, al final del procesamiento, verificar si el último mensaje procesado tenía `role: 'user'`; si NO es usuario (o no hay mensajes), llamar `createEditableBubble()`

## 7. Estilos de la burbuja editable

- [x] 7.1 En `SessionDetailPage.tsx` o en el bloque `<style>` del layout, añadir estilos para: `.message-user .message-content[contenteditable]` (cursor text, outline none), `.editable-bubble-header` (display flex, align-items center, gap), `.editable-send-btn` (estilo sutil, monospace, clickeable), placeholder visual via CSS `[contenteditable]:empty::before { content: attr(data-placeholder); color: #555; }`

## 8. Verificación

- [x] 8.1 Verificar que al cargar la página sin historial aparece la burbuja editable
- [x] 8.2 Verificar que Enter inserta newline y Ctrl+Enter envía
- [x] 8.3 Verificar que el click en `[⌃↵ Send]` envía el mensaje
- [x] 8.4 Verificar que al enviar, la burbuja se convierte en read-only y no aparece nueva hasta que el agente responde
- [x] 8.5 Verificar que pegar HTML desde el browser inserta solo texto plano
- [x] 8.6 Verificar que el indicador `●` cambia de estado (connected/disconnected) correctamente
- [x] 8.7 Verificar que con historial cuyo último mensaje es del usuario, no aparece la burbuja editable hasta `usage_update`
