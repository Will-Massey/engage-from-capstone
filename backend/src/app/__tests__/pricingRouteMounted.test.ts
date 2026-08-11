import express from 'express';
import request from 'supertest';
import { mountApiRoutes } from '../apiRoutes.js';

/**
 * routes/pricing.ts was written, imported in index.ts and called by the
 * frontend's pricing calculator, but never passed to app.use() — so every
 * suggest-fees / explain / contingent-fee call 404'd in production from the
 * day it shipped, surfacing only as a generic "could not calculate" toast.
 *
 * A missing mount is invisible to the type checker: the route file compiles,
 * the import resolves, and nothing fails until a user clicks the button. These
 * assert the mount itself, so the endpoints cannot silently detach again.
 */
describe('pricing routes are mounted', () => {
  const app = express();
  app.use(express.json());
  mountApiRoutes(app);

  it.each(['/api/pricing/suggest-fees', '/api/pricing/explain', '/api/pricing/contingent-fee'])(
    'POST %s reaches the router rather than 404ing',
    async (path) => {
      const res = await request(app).post(path).send({});
      // Unauthenticated, so the router's own authenticate middleware rejects it.
      // Any non-404 proves the path resolved; 404 would mean unmounted again.
      expect(res.status).not.toBe(404);
      expect(res.status).toBe(401);
    }
  );
});
