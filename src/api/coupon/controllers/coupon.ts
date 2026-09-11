/**
 * coupon controller
 */

import { factories } from '@strapi/strapi';
import { handleControllerError } from '../../../utils/errorHandler';

function getIdOrDocumentIdFilter(value: any) {
  if (!value) return null;
  const str = String(value).trim();
  if (/^\d+$/.test(str)) {
    return {
      $or: [{ id: Number(str) }, { documentId: str }, { code: str }],
    };
  }
  return {
    $or: [{ documentId: str }, { code: str }],
  };
}

export default factories.createCoreController(
  'api::coupon.coupon',
  ({ strapi }) => ({
    /**
     * GET /api/coupons
     */
    async find(ctx) {
      try {
        const { query } = ctx;
        const filters: any = {
          ...(typeof query?.filters === 'object' ? query.filters : {}),
        };

        const isActiveParam = query?.isActive;
        if (isActiveParam !== undefined && isActiveParam !== null && isActiveParam !== '') {
          const strVal = String(isActiveParam).trim().toLowerCase();
          if (strVal === 'true') {
            filters.isActive = true;
          } else if (strVal === 'false') {
            filters.isActive = false;
          }
        }

        const typeParam = query?.discountType || query?.type || query?.couponType;
        if (typeParam !== undefined && typeParam !== null && typeParam !== '') {
          const typeStr = String(typeParam).trim().toLowerCase();
          if (typeStr === 'percentage' || typeStr === 'flat') {
            filters.discountType = typeStr;
          }
        }

        const coupons = await strapi.documents('api::coupon.coupon').findMany({
          ...query,
          filters,
          populate: (query?.populate as any) || '*',
          sort: (query?.sort as any) || ['createdAt:desc'],
        });

        const sanitizedCoupons = await this.sanitizeOutput(coupons, ctx);
        return this.transformResponse(sanitizedCoupons);
      } catch (error: any) {
        strapi.log.error('Find Coupons Error:', error);
        return handleControllerError(ctx, error, 'Failed to fetch coupons');
      }
    },

    /**
     * GET /api/coupons/:id
     */
    async findOne(ctx) {
      try {
        const { id } = ctx.params;
        const filter = getIdOrDocumentIdFilter(id);

        if (!filter) {
          return ctx.badRequest('Invalid coupon ID or code');
        }

        const coupon = await strapi.documents('api::coupon.coupon').findFirst({
          filters: filter,
          populate: (ctx.query?.populate as any) || '*',
        });

        if (!coupon) {
          return ctx.notFound('Coupon not found');
        }

        const sanitizedCoupon = await this.sanitizeOutput(coupon, ctx);
        return this.transformResponse(sanitizedCoupon);
      } catch (error: any) {
        strapi.log.error('Find One Coupon Error:', error);
        return handleControllerError(ctx, error, 'Failed to fetch coupon');
      }
    },

    /**
     * POST /api/coupons
     */
    async create(ctx) {
      try {
        const body = ctx.request.body?.data || ctx.request.body || {};

        if (!body.code && !body.name) {
          return ctx.badRequest('Coupon code and name are required');
        }

        if (body.code) {
          body.code = String(body.code).trim().toUpperCase();
        }

        const coupon = await strapi.documents('api::coupon.coupon').create({
          data: {
            ...body,
            isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
          },
          populate: (ctx.query?.populate as any) || '*',
        });

        const sanitizedCoupon = await this.sanitizeOutput(coupon, ctx);
        return this.transformResponse(sanitizedCoupon);
      } catch (error: any) {
        strapi.log.error('Create Coupon Error:', error);
        return handleControllerError(ctx, error, 'Failed to create coupon');
      }
    },

    /**
     * PUT /api/coupons/:id
     */
    async update(ctx) {
      try {
        const { id } = ctx.params;
        const filter = getIdOrDocumentIdFilter(id);

        if (!filter) {
          return ctx.badRequest('Invalid coupon ID');
        }

        const existing = await strapi.documents('api::coupon.coupon').findFirst({
          filters: filter,
        });

        if (!existing) {
          return ctx.notFound('Coupon not found');
        }

        const body = ctx.request.body?.data || ctx.request.body || {};
        if (body.code) {
          body.code = String(body.code).trim().toUpperCase();
        }

        const docId = existing.documentId || existing.id;
        const updated = await strapi.documents('api::coupon.coupon').update({
          documentId: docId as string,
          data: body,
          populate: (ctx.query?.populate as any) || '*',
        });

        const sanitizedCoupon = await this.sanitizeOutput(updated, ctx);
        return this.transformResponse(sanitizedCoupon);
      } catch (error: any) {
        strapi.log.error('Update Coupon Error:', error);
        return handleControllerError(ctx, error, 'Failed to update coupon');
      }
    },

    /**
     * DELETE /api/coupons/:id
     */
    async delete(ctx) {
      try {
        const { id } = ctx.params;
        const filter = getIdOrDocumentIdFilter(id);

        if (!filter) {
          return ctx.badRequest('Invalid coupon ID');
        }

        const existing = await strapi.documents('api::coupon.coupon').findFirst({
          filters: filter,
        });

        if (!existing) {
          return ctx.notFound('Coupon not found');
        }

        const docId = existing.documentId || existing.id;
        await strapi.documents('api::coupon.coupon').delete({
          documentId: docId as string,
        });

        return ctx.send({
          success: true,
          message: 'Coupon deleted successfully',
        });
      } catch (error: any) {
        strapi.log.error('Delete Coupon Error:', error);
        return handleControllerError(ctx, error, 'Failed to delete coupon');
      }
    },
  })
);
