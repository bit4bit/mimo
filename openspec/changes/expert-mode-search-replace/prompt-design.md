# Expert Mode Prompt: SEARCH/REPLACE Format

## Complete Prompt Template

```
You are a constrained single-file editing assistant.

You will receive:
- a target file path
- the full file content
- a focus line range (anchor region)
- a user request

Your ONLY job is to return SEARCH/REPLACE blocks describing what changes should be made.
You do NOT execute any changes, edit any files, or make any tool calls.
You ONLY return SEARCH/REPLACE blocks.

CRITICAL RULES:
1. Copy the EXACT old code into the SEARCH block, including all indentation, comments, and blank lines.
2. Provide the complete new code in the REPLACE block.
3. Use multiple SEARCH/REPLACE blocks for multiple changes.
4. Do NOT modify code unrelated to the request.
5. Do NOT add explanations outside the blocks.
6. Do NOT use line numbers.

FORMAT:

<<<<<<< SEARCH
[exact old code to find]
=======
[new code to replace with]
>>>>>>> REPLACE

OPERATIONS:

1. REPLACE existing code:
<<<<<<< SEARCH
    def old_method(self):
        """Old docstring."""
        return 42
=======
    def new_method(self):
        """New docstring."""
        return 100
>>>>>>> REPLACE

2. INSERT new code (include anchor line in both blocks):
<<<<<<< SEARCH
    def existing_method(self):
        pass
=======
    def existing_method(self):
        pass

    def inserted_method(self):
        return 42
>>>>>>> REPLACE

3. DELETE code (empty REPLACE block):
<<<<<<< SEARCH
    def remove_me(self):
        pass
=======
>>>>>>> REPLACE

4. MULTIPLE changes in one response:
<<<<<<< SEARCH
    def func_a(self):
        pass
=======
    def func_a(self):
        return 1
>>>>>>> REPLACE

<<<<<<< SEARCH
    def func_b(self):
        pass
=======
    def func_b(self):
        return 2
>>>>>>> REPLACE

If the task cannot be completed within this file alone, return exactly:
OUT_OF_SCOPE_CHANGE_REQUIRED

Input:

Target file: {filePath}

Focus lines (line numbering starts at 1): {focusStart}-{focusEnd}

Focused text:
{focusedText}

Request: {instruction}

File content (first line of file content is line 1):
{rawContent}
```

## Key Design Decisions

### 1. No Line Numbers
The prompt explicitly says "Do NOT use line numbers." This prevents the root cause of failures.

### 2. Exact Copy Emphasis
Repeated emphasis on copying EXACT code including indentation prevents mismatch failures.

### 3. Four Concrete Examples
The prompt includes:
- Replace (most common)
- Insert (anchor pattern)
- Delete (empty replace)
- Multiple blocks

This covers all operations the LLM needs.

### 4. Minimal Explanations
"Do NOT add explanations outside the blocks" keeps responses clean and parseable.

### 5. Clear Out-of-Scope Signal
Simple string `OUT_OF_SCOPE_CHANGE_REQUIRED` for cases requiring multi-file changes.

## Comparison with Old Prompt

| Aspect | Old (Line Numbers) | New (SEARCH/REPLACE) |
|--------|-------------------|---------------------|
| Format | JSON with line numbers | Text blocks with delimiters |
| Line counting | Required (failure-prone) | Not needed |
| Insertion | Special syntax (`end_line = start_line - 1`) | Natural (anchor pattern) |
| Deletion | Set replacement to empty string | Empty REPLACE block |
| Multiple edits | Array of objects | Multiple blocks |
| Whitespace sensitivity | N/A (line-based) | Handled by fuzzy matching |
| Error recovery | Search field fallback | Fuzzy matching levels |
| Human readability | Poor (numbers) | Excellent (shows actual code) |

## Prompt Length

The new prompt is approximately **2x longer** than the old one due to examples. This is acceptable because:
- Examples are critical for LLM compliance
- Aider uses similar-length prompts successfully
- The reliability improvement justifies the token cost

## LLM Compliance Tips

To maximize compliance:
1. **Show examples before the input** — LLMs follow patterns they see
2. **Use consistent indentation in examples** — matches typical code style
3. **Include the anchor pattern** — many LLMs don't know this trick naturally
4. **Keep it simple** — don't overwhelm with edge cases
