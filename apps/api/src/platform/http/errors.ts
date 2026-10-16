import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiErrorBody, ErrorCode } from '@telecare/shared';
import type { Logger } from '../logger';

/** Throw this from services/controllers for any expected failure. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Route not found'));
};

/**
 * Converts every error into the single API error shape.
 * Unexpected errors are logged in full but returned as a generic 500, so
 * stack traces and SQL never reach the client.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const requestId = res.locals.requestId as string | undefined;
    let appError: AppError;

    if (err instanceof AppError) {
      appError = err;
    } else if (isBodyParserError(err)) {
      appError =
        err.type === 'entity.too.large'
          ? new AppError(413, 'BAD_REQUEST', 'Request body too large')
          : new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON');
    } else {
      logger.error('unhandled error', {
        requestId,
        method: req.method,
        path: req.path,
        error:
          err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
      });
      appError = new AppError(500, 'INTERNAL_ERROR', 'Something went wrong');
    }

    const body: ApiErrorBody = {
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details !== undefined && { details: appError.details }),
        ...(requestId && { requestId }),
      },
    };
    res.status(appError.status).json(body);
  };
}

function isBodyParserError(err: unknown): err is { type: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { type?: unknown }).type === 'string' &&
    'status' in err
  );
}
