## MODIFIED Requirements

### Requirement: Buffer Registration
Each buffer SHALL register with:
- `id`: Unique identifier (e.g., 'chat', 'impact', 'notes', 'summary')
- `name`: Display name shown in tabs
- `frame`: 'left' or 'right' - which frame this buffer belongs to
- `component`: React component that renders the buffer content

The right frame SHALL include the following registered buffers (in order):
- `notes` — Notes
- `impact` — Impact
- `summary` — Summary
- `mcp-servers` — MCP

#### Scenario: Summary tab appears in right frame
- **WHEN** a session page is loaded
- **THEN** the right frame tab bar SHALL contain a `Summary` tab after `Impact`
