import { Hono } from 'hono';

const app = new Hono();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Log when server starts
console.log(`Starting server on port ${PORT}...`);

app.get('/health', (c) => {
  console.log('Health check hit');
  return c.json({ status: 'healthy' });
});

// 404 handler
app.notFound((c) => {
  console.log(`404: ${c.req.url}`);
  return c.json({ error: 'Not Found', path: c.req.path }, 404);
});

const server = Bun.serve({
  fetch: app.fetch,
  port: PORT,
});

console.log(`Server running at http://localhost:${server.port}`);
