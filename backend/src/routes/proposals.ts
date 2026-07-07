import { Router } from 'express';
import collectionsRouter from './proposals/collections.js';
import crudRouter from './proposals/crud.js';
import approvalsRouter from './proposals/approvals.js';
import lifecycleRouter from './proposals/lifecycle.js';
import renewalsRouter from './proposals/renewals.js';

const router = Router();

// ROUTE-PRECEDENCE: collections (static paths like /approval-queue,
// /renewal-candidates, /stats/dashboard) MUST mount before crud, whose
// GET /:id would otherwise swallow those static GET paths.
router.use(collectionsRouter);
router.use(crudRouter);
router.use(approvalsRouter);
router.use(lifecycleRouter);
router.use(renewalsRouter);

export default router;
