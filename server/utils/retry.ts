/**
 * Resilience framework suitable for autonomous AI workflows running in
 * serverless or asynchronous managed orchestration (e.g. Manus).
 */

import { logger, safeErrorStack } from "./logger";

export async function withRetries<T>(
  operationName: string,
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      logger.warn(`Operation '${operationName}' failed (attempt ${attempt}/${maxRetries}): ${error.message}`, {
        error: safeErrorStack(error),
        attempt,
      });

      if (attempt >= maxRetries) {
        logger.error(`Operation '${operationName}' completely failed after ${maxRetries} attempts.`);
        throw new Error(`[RETRY_EXHAUSTED] ${operationName} failed: ${error.message}`);
      }
      
      const backoff = delayMs * Math.pow(2, attempt - 1);
      logger.info(`Retrying '${operationName}' in ${backoff}ms...`);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
  throw new Error("Unreachable");
}