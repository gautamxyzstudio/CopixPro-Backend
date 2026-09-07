/**
 * coupon controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController(
  'api::coupon.coupon',
  ({ strapi }) => ({

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
        return ctx.internalServerError(
          error?.message || 'Failed to fetch coupons',
        );
      }
    },
    
  })
);
