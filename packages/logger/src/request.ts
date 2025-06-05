import { Logger } from './logger';

export const requestIdByRequest = new WeakMap<Request, string>();

const loggerByRequest = new WeakMap<Request, Logger>();

/**
 * Gets the {@link Logger} of for the {@link request}.
 *
 * If the request does not have a logger, the provided {@link log}
 * will be associated to the {@link request} and returned.
 */
export function loggerForRequest(log: Logger, request: Request): Logger {
  const reqLog = loggerByRequest.get(request);
  if (reqLog) {
    return reqLog;
  }
  loggerByRequest.set(request, log);
  return log;
}
