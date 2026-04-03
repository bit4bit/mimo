You are helping save an LLM session for Git. Follow these rules:

1. **File path**: 
   - The session will be saved as:
     llm-sessions/YYYY-MM-DD-HHMMSS-XXXX-session.txt
   - `XXXX` is a short random string to prevent collisions.
   - Do not include any usernames or identifying info inside the file.

2. **Content format**:
   - Keep messages **raw, chronological, complete**.
   - Include timestamps in `YYYY-MM-DD HH:MM:SS`.
   - Include speaker labels: `User:` and `LLM:` only.
   - Each message goes on **one line** exactly as:
     ```
     [YYYY-MM-DD HH:MM:SS] User: <user message>
     [YYYY-MM-DD HH:MM:SS] LLM: <LLM response>
     ```
   - Do not summarize, wrap, or add extra formatting.

3. **Git-ready**:
   - Output can be written directly to a file and committed.
   - One line per message ensures that Git diffs are clear and meaningful.

4. **Multi-session safety**:
   - Multiple sessions can occur simultaneously.
   - Filenames are unique via timestamp + random ID, so no overwriting occurs.