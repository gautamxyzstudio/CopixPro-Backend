/**
 * Controller error handler utility.
 * Formats and sends proper HTTP responses for 403, 401, 400, 404, 429, 413,
 * rather than converting all caught errors to 500 Internal Server Error.
 */
export function handleControllerError(
  ctx: any,
  error: any,
  fallbackMessage: string = 'An error occurred'
) {
  if (
    error?.name === 'ForbiddenError' ||
    error?.name === 'PolicyError' ||
    error?.message === 'Forbidden access' ||
    error?.status === 403
  ) {
    return ctx.forbidden(error?.message || 'Forbidden access', error?.details);
  }

  if (
    error?.name === 'UnauthorizedError' ||
    error?.message === 'Unauthorized' ||
    error?.status === 401
  ) {
    return ctx.unauthorized(error?.message || 'Unauthorized', error?.details);
  }

  if (
    error?.name === 'ValidationError' ||
    error?.name === 'YupValidationError' ||
    error?.status === 400
  ) {
    return ctx.badRequest(error?.message || 'Bad Request', error?.details);
  }

  if (
    error?.name === 'NotFoundError' ||
    error?.status === 404
  ) {
    return ctx.notFound(error?.message || 'Not Found', error?.details);
  }

  if (
    error?.name === 'RateLimitError' ||
    error?.status === 429
  ) {
    return ctx.tooManyRequests(error?.message || 'Too Many Requests', error?.details);
  }

  if (
    error?.name === 'PayloadTooLargeError' ||
    error?.status === 413
  ) {
    return ctx.payloadTooLarge(error?.message || 'Payload Too Large', error?.details);
  }

  return ctx.internalServerError(
    error?.message || fallbackMessage,
    error?.details
  );
}

export default handleControllerError;
