/**
 * @deprecated Use `./tenant.js` — re-exported for backward compatibility.
 */
export {
  extractTenant,
  tenantHeader,
  validateTenantMembership,
  parseSubdomainFromHost,
  resolveTenantForRequest,
} from './tenant.js';

import {
  extractTenant,
  tenantHeader,
  validateTenantMembership,
} from './tenant.js';

export default { extractTenant, tenantHeader, validateTenantMembership };
