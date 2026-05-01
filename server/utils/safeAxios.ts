/**
 * `safeAxios` — drop-in axios replacement with a baked-in 10s timeout
 * and reasonable response-size cap. Importing this instead of bare
 * `axios` ensures every outbound HTTP call from socialOAuth /
 * ecommerceOAuth / etc. has a bounded wall-clock deadline, instead of
 * hanging the worker on a slow upstream provider.
 *
 * For URLs that originate from user input (image fetches, webhooks
 * fan-out) prefer `safeImageFetch` / `assertSafeUrl` from `./safeFetch`,
 * which add SSRF protection on top of the timeout.
 */
import axios from "axios";

export const DEFAULT_OAUTH_TIMEOUT_MS = 10_000;
export const DEFAULT_OAUTH_MAX_BYTES = 5 * 1024 * 1024;

const safeAxios = axios.create({
  timeout: DEFAULT_OAUTH_TIMEOUT_MS,
  maxContentLength: DEFAULT_OAUTH_MAX_BYTES,
  maxBodyLength: DEFAULT_OAUTH_MAX_BYTES,
  maxRedirects: 3,
});

export default safeAxios;
