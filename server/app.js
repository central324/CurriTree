import express from 'express';
import { fileURLToPath } from 'node:url';

export const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

// A minimal endpoint to verify that the server runs.
app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'CurriTree' });
});

// The actual planner screens will replace the temporary start page.
const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
app.use(express.static(publicDirectory));
