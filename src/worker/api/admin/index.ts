import { Hono } from 'hono';
import settingsRoutes from './settings';
import providersRoutes from './providers';
import logsRoutes from './logs';
import statsRoutes from './stats';

const app = new Hono<{ Bindings: Env }>();
app.route('/settings', settingsRoutes);
app.route('/providers', providersRoutes);
app.route('/logs', logsRoutes);
app.route('/stats', statsRoutes);

export default app;
