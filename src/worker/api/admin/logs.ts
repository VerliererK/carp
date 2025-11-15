import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requestLogs } from '../../lib/db';

const app = new Hono<{ Bindings: Env }>();

// GET /api/admin/logs
// limit: Number of records to return (default: 100)
// offset: Pagination offset (default: 0)
// provider_id: Filter by specific provider ID
// success: Filter by success status (true/false/1/0)
// start_date: Start date filter (format: YYYY-MM-DD)
// end_date: End date filter (format: YYYY-MM-DD)
app.get('/', async (c) => {
  const query = c.req.query();

  const limit = parseInt(query.limit || '100');
  if (isNaN(limit) || limit <= 0 || limit > 100) throw new HTTPException(400, { message: "Invalid parameter 'limit': must be between 1 and 100" });

  const offset = parseInt(query.offset || '0');
  if (isNaN(offset) || offset < 0) throw new HTTPException(400, { message: "Invalid parameter 'offset': must be greater than or equal to 0" });

  const options: any = {
    limit,
    offset
  };

  if (query.provider_id) {
    const providerId = parseInt(query.provider_id);
    if (isNaN(providerId) || providerId <= 0) throw new HTTPException(400, { message: "Invalid parameter 'provider_id': must be a positive integer" });
    options.providerId = providerId;
  }

  if (query.success !== undefined && query.success !== '') {
    options.success = query.success.toLowerCase() === 'true';
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (query.start_date) {
    if (!dateRegex.test(query.start_date)) throw new HTTPException(400, { message: "Invalid parameter 'start_date': must be in YYYY-MM-DD format" });
    options.startDate = query.start_date;
  }
  if (query.end_date) {
    if (!dateRegex.test(query.end_date)) throw new HTTPException(400, { message: "Invalid parameter 'end_date': must be in YYYY-MM-DD format" });
    options.endDate = query.end_date;
  }

  const result = await requestLogs.listWithFilters(c.env.DB, options);

  return c.json({
    logs: result.logs,
    total: result.total,
    limit,
    offset
  });
});

export default app;
