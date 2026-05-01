export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
/**
 * Default session lifetime — 30 days. Previously a year, which made
 * the "logout everywhere" story moot because a stolen cookie stayed
 * valid until the secret was rotated. 30d is a comfortable default
 * for a SaaS dashboard the operator hits at least weekly while still
 * bounding blast radius on a credential leak.
 */
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
