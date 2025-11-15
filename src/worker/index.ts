import { Hono } from 'hono';
import apiRoutes from './api';
import { proxyHandler } from './api/proxy';

const app = new Hono<{ Bindings: Env }>();

// --- Routes ---
app.all('/proxy/:provider/*', proxyHandler);
app.route('/api', apiRoutes);

export default app;
