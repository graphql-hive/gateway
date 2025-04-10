import { Logger } from './Logger';

// TODO: write tests

export const requestIdByRequest = new WeakMap<Request, string>();

/** The getter function that extracts the requestID from the {@link request} or creates a new one if none-exist. */
export type GetRequestID = (request: Request) => string;

/**
 * Creates a child {@link Logger} under the {@link log given logger} for the {@link request}.
 *
 * Request's ID will be stored in the {@link requestIdByRequest} weak map; meaning, all
 * subsequent calls to this function with the same {@link request} will return the same ID.
 *
 * The {@link getId} argument will be used to create a new ID if the {@link request} does not
 * have one. The convention is to the `X-Request-ID` header or create a new ID which is an
 * UUID v4.
 *
 * On the other hand, if the {@link getId} argument is omitted, the {@link requestIdByRequest} weak
 * map will be looked up, and if there is no ID stored for the {@link request} - the function
 * will not attempt to create a new ID and will just return the same {@link log logger}.
 *
 * The request ID will be added to the logger attributes under the `requestId` key and
 * will be logged in every subsequent log.
 */
export function loggerForRequest(log: Logger, request: Request): Logger;
export function loggerForRequest(
  log: Logger,
  request: Request,
  getId: GetRequestID,
): Logger;
export function loggerForRequest(
  log: Logger,
  request: Request,
  getId?: GetRequestID,
): Logger {
  let requestId = requestIdByRequest.get(request);
  if (!requestId) {
    if (getId === undefined) {
      return log;
    }
    requestId = getId(request);
    requestIdByRequest.set(request, requestId);
  }
  if (
    log.attrs &&
    'requestId' in log.attrs &&
    log.attrs['requestId'] === requestId
  ) {
    // this logger is already a child that contains this request id, no need to create a new one
    return log;
  }
  return log.child({ requestId });
}
