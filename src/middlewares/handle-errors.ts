import type { Core } from '@strapi/strapi';

export default (config: any, { strapi }: { strapi: Core.Strapi }) => {
  return async (ctx: any, next: any) => {
    try {
      await next();
    } catch (error: any) {
      // Catch Forbidden errors (name, message, or status 403)
      if (
        error?.name === 'ForbiddenError' ||
        error?.name === 'PolicyError' ||
        error?.message === 'Forbidden access' ||
        error?.status === 403
      ) {
        return ctx.forbidden(error.message || 'Forbidden access', error.details);
      }

      // Catch Unauthorized errors (name, message, or status 401)
      if (
        error?.name === 'UnauthorizedError' ||
        error?.message === 'Unauthorized' ||
        error?.status === 401
      ) {
        return ctx.unauthorized(error.message || 'Unauthorized', error.details);
      }

      // Catch Validation errors (name or status 400)
      if (
        error?.name === 'ValidationError' ||
        error?.name === 'YupValidationError' ||
        error?.status === 400
      ) {
        return ctx.badRequest(error.message || 'Bad Request', error.details);
      }

      // Catch Not Found errors (name or status 404)
      if (
        error?.name === 'NotFoundError' ||
        error?.status === 404
      ) {
        return ctx.notFound(error.message || 'Not Found', error.details);
      }

      // Catch Rate Limit errors (name or status 429)
      if (
        error?.name === 'RateLimitError' ||
        error?.status === 429
      ) {
        return ctx.tooManyRequests(error.message || 'Too Many Requests', error.details);
      }

      // Catch Payload Too Large errors (name or status 413)
      if (
        error?.name === 'PayloadTooLargeError' ||
        error?.status === 413
      ) {
        return ctx.payloadTooLarge(error.message || 'Payload Too Large', error.details);
      }

      // Rethrow other errors to let Strapi's default error handler handle 500s
      throw error;
    }
  };
};
