# mimo-platform

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.2.23. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Environment Variables

| Variable       | Default                 | Description                                                                                                                                                    |
| -------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`         | `3000`                  | Port the platform listens on                                                                                                                                   |
| `PLATFORM_URL` | `http://localhost:PORT` | Public URL of the platform, used to tell agents where to connect for Fossil sync. **Must be set when mimo-agent runs on a different host than mimo-platform.** |

### Remote agent setup

By default `PLATFORM_URL` resolves to `http://localhost:<PORT>`, which works when the agent and platform run on the same machine. When they run on different hosts, set `PLATFORM_URL` to the address the agent can reach:

```bash
PLATFORM_URL=http://192.168.1.10:3000 bun run index.ts
```

The agent uses this URL to construct the Fossil server address for each session.

## License

GNU Affero General Public License v3.0 only (AGPL-3.0-only).

Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
