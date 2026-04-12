# Proposal: Frame-Based Buffer System

## Summary
Introduce a **Frame** abstraction that groups multiple buffers per session, with each frame supporting tab-based switching between buffers. This brings Emacs-style window management to the MIMO session interface.

## Motivation
Currently, the session page has a rigid two-buffer layout: Chat (left) and Impact (right). Adding new buffers like Notes/Scratch requires a flexible container system that allows:
- Multiple buffers per frame
- Tab-based switching between buffers
- Clean separation between frame layout and buffer content

## Design Goals
1. **Fixed Frame Layout**: Two frames (left, right) with fixed sizes (flex: 2 and flex: 1)
2. **Tab-based Buffer Switching**: Each frame has tabs to switch between its buffers
3. **Static Buffer Assignment**: Chat → Left, Impact → Right, Notes → Right (configurable per session)
4. **Per-Session State**: Which buffer is active in each frame is stored per session
5. **Extensible**: New buffer types can be registered without modifying frame logic

## Scope

### In Scope
- Frame component with tab bar
- Buffer registry system
- Per-session frame state (active buffer per frame)
- Notes/Scratch buffer implementation
- Migration of existing Chat and Impact to new system

### Out Scope
- Dynamic frame creation (more than 2 frames)
- Drag-and-drop buffer reordering
- Resizable frames
- Buffer persistence (content already persisted, just switching state)

## Success Criteria
- [ ] Left frame shows Chat tab
- [ ] Right frame shows Impact and Notes tabs, defaults to Impact
- [ ] Clicking tabs switches buffers within frame
- [ ] State persists across page reloads
- [ ] New buffers can be added with minimal code changes
- [ ] Existing functionality (chat streaming, impact refresh) continues to work

## References
- Emacs frame/buffer model
- Current: `SessionDetailPage.tsx`, `ImpactBuffer.tsx`, `chat.js`
