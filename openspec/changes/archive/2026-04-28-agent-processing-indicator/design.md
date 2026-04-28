## Context

El chat de sesión usa WebSockets en tres capas: browser ↔ platform ↔ mimo-agent. Cuando el usuario envía un mensaje, el platform lo reenvía al agente vía WS. El agente lo entrega al proveedor ACP (opencode o claude-agent). El primer feedback visible en el UI es el evento `thought_start`, que el proveedor genera solo cuando empieza a razonar — lo que puede demorar segundos.

El UI actual crea el elemento del mensaje "Agent" cuando llega `thought_start` o `message_chunk`. No existe ningún indicador previo.

## Goals / Non-Goals

**Goals:**
- Confirmar visualmente que el agente recibió el mensaje y que el proveedor está en proceso, antes de que llegue el primer chunk.
- Reutilizar el mismo elemento DOM del mensaje Agent a lo largo de todo el ciclo (espera → pensando → respondiendo).
- No modificar la persistencia del chat (chat.jsonl) ni el protocolo HTTP.

**Non-Goals:**
- No confirmar que el *proveedor* (opencode/claude) está activamente generando — eso ya lo hace `thought_start`.
- No agregar timeouts ni reintentos si el agente no responde.
- No cambiar el comportamiento cuando no hay agente conectado.

## Decisions

### D1: El evento `prompt_received` lo emite el agente (no el platform)

**Decisión**: El mimo-agent envía `prompt_received` al platform justo antes de llamar `acpClient.prompt()`.

**Alternativa descartada**: El platform podría emitir el evento en cuanto envía `user_message` al agente. Pero eso no confirma que el agente lo recibió — solo que el platform lo envió por WS. Si el agente está en un estado intermedio (ACP no inicializado aún), el usuario vería el indicador aunque el mensaje no sea procesado.

**Rationale**: La señal más honesta es la del agente mismo, después de verificar que tiene un `acpClient` activo para la sesión.

### D2: El elemento DOM del mensaje Agent se crea al recibir `prompt_received`

**Decisión**: `handleWebSocketMessage` crea `currentMessageElement` con un indicador "⟳ Recibido, procesando..." cuando llega `prompt_received`. Los handlers existentes de `thought_start` y `appendMessageChunk` verifican si `currentMessageElement` ya existe antes de crear uno nuevo.

**Alternativa descartada**: Crear un elemento separado que desaparece al llegar `thought_start`. Introduce más complejidad DOM y puede producir flashes visuales.

**Rationale**: La evolución in-place (waiting → thinking → responding) es más limpia y consistente con el modelo mental del usuario de "un mensaje = una burbuja".

### D3: El indicador usa la animación `blink` ya existente

El codebase ya define `@keyframes blink`. El indicador de espera reutiliza este estilo con el mismo símbolo `●` que usa `streaming-indicator`, para mantener coherencia visual sin agregar CSS nuevo.

## Risks / Trade-offs

- **[Riesgo] El agente envía `prompt_received` pero el ACP falla**: El indicador "procesando..." quedaría visible indefinidamente. → Mitigación: Los errores existentes de ACP (`error_response`) deben limpiar `currentMessageElement` si existe. Este manejo ya existe parcialmente en el `showError()` del chat.js; debe verificarse que también limpia el estado.

- **[Trade-off] El evento `prompt_received` es fire-and-forget**: No hay ACK del platform al agente. Si el platform no tiene chat clients conectados, el evento se descarta silenciosamente — lo cual es correcto (no hay UI que actualizar).

- **[Riesgo] Race condition con mensajes rápidos**: Si el usuario envía dos mensajes antes de que el primero produzca `thought_start`, el segundo `prompt_received` crearía un segundo elemento pero `currentMessageElement` ya apuntaría al primero. → No es un caso de uso real ya que el input queda efectivamente bloqueado mientras el agente procesa, pero conviene documentarlo.

## Migration Plan

Los tres archivos modificados son independientes entre sí. El cambio es aditivo (nuevo tipo de mensaje) y no rompe clientes que no lo soporten. Deploy directo sin pasos de migración.

## Open Questions

- ¿El texto del indicador debería ser en inglés ("Received, processing...") o en español? El resto de la UI usa inglés para labels técnicos.
- ¿Debe limpiarse `currentMessageElement` si llega un `error` del agente? (Recomendado: sí, para evitar el indicador huérfano.)
