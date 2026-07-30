import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::order.order",
  ({ strapi }) => ({

    async create(ctx) {

      const {
        customerName,
        customerEmail,
        amount,
        currency,
        software,
        user
      } = ctx.request.body;

      if (!customerName || !customerEmail || !amount) {
        return ctx.badRequest("Missing required fields");
      }

      const orderNumber = `CPX-${Date.now()}`;

      const order = await strapi.entityService.create(
        "api::order.order",
        {
          data: {
            orderNumber,
            customerName,
            customerEmail,
            amount,
            currency: currency || "USD",
            paymentMethod: "WISE",
            paymentReference: orderNumber,
            paymentStatus: "pending",
            software,
            users_permissions_user: user
          },
          populate: {
            software: true,
            users_permissions_user: true
          }
        }
      );

      ctx.send({
        success: true,
        order,
        paymentLink: process.env.WISE_PAYMENT_LINK
      });

    },

    async paymentStatus(ctx) {

      const { orderNumber } = ctx.params;

      const order = await strapi.db.query("api::order.order").findOne({
        where: {
          orderNumber
        }
      });

      if (!order) {
        return ctx.notFound("Order not found");
      }

      ctx.send({
        success: true,
        paymentStatus: order.paymentStatus,
        order
      });

    }

  })
);