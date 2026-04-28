## 1. Add copy button to message header

- [x] 1.1 In `chat.js`, modify `addMessageToChat()` to add a copy button inside `.message-header`, right after the role label
- [x] 1.2 Add click handler: `navigator.clipboard.writeText(this.closest('.message').querySelector('.message-content').textContent)`

## 2. Add copy button to streaming messages

- [x] 2.1 In `chat.js`, add copy button to `createWaitingAgentMessage()` 
- [x] 2.2 In `chat.js`, add copy button to `startThoughtSection()` (when creating message element)
- [x] 2.3 In `chat.js`, add copy button to `appendMessageChunk()` (when creating message element)

## 3. Add copy button styling

- [x] 3.1 CSS for `.copy-btn` and flexbox for `.message-header` added to `SessionDetailPage.tsx` `<style>` block
