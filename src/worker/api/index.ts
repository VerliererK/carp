import { Hono } from 'hono';
import adminRoutes from './admin';

const app = new Hono<{ Bindings: Env }>();
app.route('/admin', adminRoutes);

export default app;
