/**
 * Proposal Sharing, Tracking, and e-Signature Routes
 *
 * Thin barrel — the route handlers live in ./proposalsShare/*.ts.
 */

import { Router } from 'express';
import { extractTenant } from '../middleware/tenant.js';
import manageRouter from './proposalsShare/manage.js';
import publicViewRouter from './proposalsShare/publicView.js';
import publicSignRouter from './proposalsShare/publicSign.js';
import documentsRouter from './proposalsShare/documents.js';
import portalRouter from './proposalsShare/portal.js';

const router = Router();

// Apply tenant extraction to all routes
router.use(extractTenant);

// ROUTE-PRECEDENCE: mount order reproduces the original registration
// sequence — tenant-scoped /:id routes first, then public /view/:token
// view routes, then sign/decline/payment, then signature-image + PDF
// download, then /portal routes.
router.use(manageRouter);
router.use(publicViewRouter);
router.use(publicSignRouter);
router.use(documentsRouter);
router.use(portalRouter);

export default router;
