import { Router } from 'express';
import signupRouter from './tenants/signup.js';
import firmGroupRouter from './tenants/firmGroup.js';
import settingsRouter from './tenants/settings.js';
import agencyRouter from './tenants/agency.js';
import accountRouter from './tenants/account.js';

const router = Router();

// ROUTE-PRECEDENCE: mount order reproduces the original registration sequence
// of the pre-split tenants.ts exactly. All top-level path segments across the
// sub-routers are distinct static prefixes, so no parameterized route can
// swallow a later static one, but keep this order to match master verbatim.
router.use(signupRouter);
router.use(firmGroupRouter);
router.use(settingsRouter);
router.use(agencyRouter);
router.use(accountRouter);

export default router;
