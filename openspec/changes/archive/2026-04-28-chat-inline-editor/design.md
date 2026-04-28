## Context

El chat usa un `<input type="text">` en un `#chat-form` separado del área de mensajes. El historial de mensajes vive en `#chat-messages` y el input en un div hermano debajo. La lógica de envío está en `setupChatInput()` en `chat.js`, que escucha el `submit` del form.

El nuevo modelo elimina el form del servidor y delega toda la creación del área de entrada a `chat.js`, que construye dinámicamente una burbuja "YOU" con `contenteditable`.

## Goals / Non-Goals

**Goals:**
- Burbuja editable visualmente idéntica a los mensajes "YOU" del historial.
- Envío con `Ctrl+Enter` y click en botón `[⌃↵ Send]`.
- El indicador de conexión `●` vive en el header de la burbuja editable.
- La burbuja editable aparece solo cuando el usuario puede enviar (no mientras el agente procesa).
- Soporte multilinea nativo con `contenteditable`.

**Non-Goals:**
- Keybinding configurable (Ctrl+Enter hardcodeado por ahora).
- Soporte de formato rich text (bold, italic, etc.) — solo texto plano.
- Edición de mensajes ya enviados.
- Drag & drop de archivos.

## Decisions

### D1: `contenteditable` div en lugar de `textarea`

**Decisión**: La burbuja editable usa un `<div contenteditable="true">` como área de texto.

**Alternativa**: `<textarea>` dentro de la burbuja. Requiere CSS adicional para eliminar bordes y resize handle, y su valor se lee con `.value` en lugar de `.innerText`. Visualmente es más difícil de igualar a los otros mensajes.

**Rationale**: `contenteditable` permite que el div sea estructuralmente idéntico a `.message-content` de otros mensajes. El único costo es el handler de `paste` para strip de HTML.

### D2: Ciclo de vida de la burbuja ligado a `usage_update`

**Decisión**: La burbuja editable desaparece al enviar y reaparece solo cuando llega `usage_update` (fin de respuesta del agente).

**Alternativa A**: Reaparece inmediatamente después de enviar. Permite al usuario escribir mientras el agente piensa. Riesgo: mensajes enviados fuera de orden.

**Alternativa B**: La burbuja siempre está visible pero disabled mientras el agente procesa. Más complejo de mantener.

**Rationale**: Opción B conservadora es la más segura para el flujo conversacional y evita envíos concurrentes al agente.

### D3: El header de la burbuja editable como contenedor del status + send

**Decisión**: La burbuja editable tiene un header con estructura: `[YOU] [●] [─────] [⌃↵ Send]`. El `●` es el indicador de conexión (no clickeable). El `[⌃↵ Send]` es un `<button>` clickeable.

**Rationale**: Concentrar todos los controles de entrada en un solo lugar visual. Eliminar `showConnectionStatus()` que apunta a `.chat-connection-status` — ese elemento ya no existirá.

### D4: La burbuja editable vive dentro de `#chat-messages`

**Decisión**: La burbuja editable se inserta como último hijo de `#chat-messages`, no en un contenedor hermano.

**Rationale**: Permite que el scroll del chat la muestre naturalmente al final del historial. Al enviar, se convierte en un mensaje más del historial, y la nueva burbuja editable se agrega al final.

### D5: Detección del estado inicial en `loadChatHistory()`

**Decisión**: Al final de `loadChatHistory()`, verificar si el último mensaje procesado tiene `role: 'user'`. Si es así, no crear burbuja editable (el agente aún está procesando). En cualquier otro caso, crear la burbuja.

**Rationale**: Cubre el caso de recarga de página mientras el agente aún no ha respondido.

## Risks / Trade-offs

- **[Riesgo] Paste con HTML**: `contenteditable` recibe HTML al pegar desde browsers. → Handler `paste` que hace `preventDefault()` y lee `event.clipboardData.getData('text/plain')`.
- **[Riesgo] `showConnectionStatus()` rota**: Actualmente apunta a `.chat-connection-status` que se elimina. → Reescribir para apuntar al `●` dentro de la burbuja editable. Si la burbuja no existe (agente procesando), el status update es silencioso.
- **[Trade-off] Sin envío mientras el agente procesa**: El usuario no puede enviar mensajes en paralelo. → Aceptable por diseño (Opción B elegida).
- **[Riesgo] `Ctrl+Enter` vs `Enter` en OS distintos**: En Mac `Ctrl+Enter` es correcto. `Cmd+Enter` sería más idiomático pero el usuario eligió `Ctrl+Enter` explícitamente. → Hardcodeado como está.

## Migration Plan

Cambio puramente client-side. No hay migración de datos. El HTML del servidor pierde el `#chat-form`; si el JS no carga, el usuario no ve el input — aceptable para una app que requiere JS.
