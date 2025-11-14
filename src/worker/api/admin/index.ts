import { Hono } from 'hono';
import settingsRoutes from './settings';

const app = new Hono<{ Bindings: Env }>();
app.route('/settings', settingsRoutes);

export default app;
