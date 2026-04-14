import type { FC } from "hono/jsx";
import type { BufferConfig, BufferProps, FrameId } from "../buffers/types.js";

interface FrameProps {
  frameId: FrameId;
  sessionId: string;
  buffers: BufferConfig[];
  activeBufferId: string;
  onBufferSwitch?: (bufferId: string) => void;
  bufferProps?: Record<string, Partial<BufferProps>>;
}

export const Frame: FC<FrameProps> = ({
  frameId,
  sessionId,
  buffers,
  activeBufferId,
  bufferProps = {},
}) => {
  const resolvedActiveBufferId = buffers.some(
    (buffer) => buffer.id === activeBufferId,
  )
    ? activeBufferId
    : buffers[0]?.id;

  return (
    <div class={`frame frame-${frameId}`} data-frame-id={frameId}>
      <div class="frame-tab-bar">
        {buffers.map((buffer) => {
          const isActive = buffer.id === resolvedActiveBufferId;
          return (
            <button
              type="button"
              class={`frame-tab ${isActive ? "active" : ""}`}
              data-frame-id={frameId}
              data-buffer-id={buffer.id}
              aria-selected={isActive ? "true" : "false"}
            >
              {buffer.name}
            </button>
          );
        })}
      </div>

      <div class="frame-content">
        {buffers.length === 0 && (
          <div class="frame-empty">No buffers configured</div>
        )}
        {buffers.map((buffer) => {
          const BufferComponent = buffer.component;
          const isActive = buffer.id === resolvedActiveBufferId;
          const extraProps = bufferProps[buffer.id] ?? {};
          return (
            <div
              class={`frame-buffer-panel ${isActive ? "active" : "hidden"}`}
              data-frame-id={frameId}
              data-buffer-panel={buffer.id}
              style={isActive ? "display: flex;" : "display: none;"}
            >
              <BufferComponent
                sessionId={sessionId}
                isActive={isActive}
                {...extraProps}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
