import { Hono } from 'hono';
import settingsRoutes from './settings';
import providersRoutes from './providers';

const app = new Hono<{ Bindings: Env }>();
app.route('/settings', settingsRoutes);
app.route('/providers', providersRoutes);

export default app;
