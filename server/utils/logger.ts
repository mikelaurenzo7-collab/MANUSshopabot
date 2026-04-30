/**
 * Robust Logger for Manus AI Context
 * 
 * Production-ready structured logging utility to ensure AI agent actions
 * are observable, auditable, and traceably isolated by agent/platform.
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

type LogLevel = keyof typeof LOG_LEVELS;

interface LogMetadata {
  agentType?: "architect" | "merchant" | "social" | "system";
  storeId?: number;
  /** DB primary key (number) for engine workflows; opaque string for
   *  external references that share a "workflow id" naming convention. */
  workflowId?: string | number;
  externalRef?: string;
  [key: string]: any;
}

export const logger = {
  log: (level: LogLevel, message: string, meta: LogMetadata = {}) => {
    const timestamp = new Date().toISOString();
    const metaString = Object.keys(meta).length ? JSON.stringify(meta) : "";
    const prefix = meta.agentType ? `[AGENT:${meta.agentType.toUpperCase()}]` : "[SYSTEM]";

    const output = `${timestamp} ${prefix} [${level}] ${message} ${metaString}`;

    switch (level) {
      case "DEBUG":
        console.debug(output);
        break;
      case "INFO":
        console.info(output);
        break;
      case "WARN":
        console.warn(output);
        break;
      case "ERROR":
        console.error(output);
        break;
    }
  },
  
  debug: (message: string, meta?: LogMetadata) => logger.log("DEBUG", message, meta),
  info: (message: string, meta?: LogMetadata) => logger.log("INFO", message, meta),
  warn: (message: string, meta?: LogMetadata) => logger.log("WARN", message, meta),
  error: (message: string, meta?: LogMetadata) => logger.log("ERROR", message, meta),
};
