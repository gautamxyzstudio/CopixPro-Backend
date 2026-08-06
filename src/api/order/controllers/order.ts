import { factories } from "@strapi/strapi";
import orderExpirationService from "../../../services/orderExpirationService";

function getIdOrDocumentIdFilter(value: any) {
  if (!value) return null;
  const str = String(value).trim();
  if (/^\d+$/.test(str)) {
    return {
      $or: [{ id: Number(str) }, { documentId: str }],
    };
  }
  return { documentId: str };
}

function formatMediaUrl(
  media: any,
  fallbackUrl?: string | null,
): string | null {
  if (media && typeof media === "object" && media.url) {
    const url = String(media.url).trim();
    if (url) {
      if (url.startsWith("http://") || url.startsWith("https://")) {
        return url;
      }
      const backendUrl = (
        process.env.BACKEND_URL || "http://localhost:1338"
      ).replace(/\/$/, "");
      const cleanUrl = url.startsWith("/") ? url : `/${url}`;
      return `${backendUrl}${cleanUrl}`;
    }
  }
  if (fallbackUrl && typeof fallbackUrl === "string" && fallbackUrl.trim()) {
    const url = fallbackUrl.trim();
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    const backendUrl = (
      process.env.BACKEND_URL || "http://localhost:1338"
    ).replace(/\/$/, "");
    const cleanUrl = url.startsWith("/") ? url : `/${url}`;
    return `${backendUrl}${cleanUrl}`;
  }
  return null;
}

export default factories.createCoreController(
  "api::order.order",
  ({ strapi }) => ({
    async create(ctx) {
      const body = ctx.request.body?.data || ctx.request.body || {};
      const {
        customerName,
        customerEmail,
        amount,
        currency,
        software,
        softwareId,
        user,
        userId,
        users_permissions_user,
      } = body;

      if (!customerName || !customerEmail || !amount) {
        return ctx.badRequest("Missing required fields");
      }

      const orderNumber = `CPX-${Date.now()}`;

      // 1. Resolve User (from Authorization header JWT, ctx.state.user, passed payload, or email lookup)
      let targetUser = ctx.state.user;

      const authHeader =
        ctx.headers.authorization || ctx.request.headers.authorization;
      if (!targetUser && authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const token = authHeader.split(" ")[1];
          const decoded = await strapi
            .plugin("users-permissions")
            .service("jwt")
            .verify(token);

          if (decoded?.id) {
            targetUser = await strapi
              .documents("plugin::users-permissions.user")
              .findFirst({
                filters: { id: decoded.id },
              });
          }
        } catch (err) {
          strapi.log.warn("Invalid JWT token provided in Authorization header");
        }
      }

      const providedUser = user || userId || users_permissions_user;
      if (!targetUser && providedUser) {
        if (
          typeof providedUser === "object" &&
          (providedUser.id || providedUser.documentId)
        ) {
          targetUser = providedUser;
        } else {
          targetUser = await strapi
            .documents("plugin::users-permissions.user")
            .findFirst({
              filters: getIdOrDocumentIdFilter(providedUser),
            });
        }
      }

      if (!targetUser && customerEmail) {
        targetUser = await strapi
          .documents("plugin::users-permissions.user")
          .findFirst({
            filters: {
              email: { $eqi: customerEmail.toLowerCase().trim() },
            },
          });
      }

      // 2. Resolve Software (from passed payload or fallback to default software record)
      let targetSoftware: any = null;
      const providedSoftware = software || softwareId;

      if (providedSoftware) {
        if (
          typeof providedSoftware === "object" &&
          (providedSoftware.id || providedSoftware.documentId)
        ) {
          targetSoftware = providedSoftware;
        } else {
          targetSoftware = await strapi
            .documents("api::software.software")
            .findFirst({
              filters: getIdOrDocumentIdFilter(providedSoftware),
            });
        }
      }

      if (!targetSoftware) {
        targetSoftware = await strapi
          .documents("api::software.software")
          .findFirst({});
      }

      // 3. Create Order with linked relations
      const order = await strapi.documents("api::order.order").create({
        data: {
          orderNumber,
          customerName,
          customerEmail,
          amount: Number(amount),
          currency: currency || "USD",
          paymentMethod: "WISE",
          paymentReference: orderNumber,
          paymentStatus: "pending",
          software: targetSoftware
            ? targetSoftware.documentId || targetSoftware.id
            : null,
          users_permissions_user: targetUser
            ? targetUser.documentId || targetUser.id
            : null,
          publishedAt: new Date().toISOString(),
        },
        populate: ["software", "users_permissions_user"],
        status: "published",
      });

      ctx.send({
        success: true,
        order,
        paymentLink: process.env.WISE_PAYMENT_LINK,
      });
    },

    async getMyOrders(ctx) {
      // Trigger order expiration check for orders >30m old without wiseTransactionId
      await orderExpirationService.expireUnpaidOrders(strapi);

      let user = ctx.state.user;

      const authHeader =
        ctx.headers.authorization || ctx.request.headers.authorization;
      if (!user && authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const token = authHeader.split(" ")[1];
          const decoded = await strapi
            .plugin("users-permissions")
            .service("jwt")
            .verify(token);

          if (decoded?.id) {
            user = await strapi
              .documents("plugin::users-permissions.user")
              .findFirst({
                filters: { id: decoded.id },
              });
          }
        } catch (err) {
          strapi.log.warn(
            "Invalid JWT token provided in getMyOrders Authorization header",
          );
        }
      }

      if (!user) {
        return ctx.send(
          {
            success: false,
            message: "Authentication required to view your orders",
          },
          401,
        );
      }

      const filters: any[] = [];
      if (user.id) {
        filters.push({ users_permissions_user: { id: user.id } });
      }
      if (user.documentId) {
        filters.push({
          users_permissions_user: { documentId: user.documentId },
        });
      }
      if (user.email) {
        filters.push({
          customerEmail: { $eqi: user.email.toLowerCase().trim() },
        });
      }

      const orders = await strapi.documents("api::order.order").findMany({
        filters: {
          $or: filters,
        },
        populate: {
          software: {
            populate: ["software_url", "user_manual_pdf"],
          },
          users_permissions_user: true,
        },
        sort: ["createdAt:desc"],
      });

      const formattedOrders = (orders || []).map((ord: any) => {
        if (ord.software) {
          const software_url = formatMediaUrl(
            ord.software.software_url,
            ord.software.downloadFileUrl,
          );
          const user_manual_pdf = formatMediaUrl(ord.software.user_manual_pdf);
          return {
            ...ord,
            software: {
              ...ord.software,
              software_url,
              user_manual_pdf,
            },
          };
        }
        return ord;
      });

      return ctx.send({
        success: true,
        count: formattedOrders.length,
        orders: formattedOrders,
      });
    },

    async paymentStatus(ctx) {
      // Trigger order expiration check for orders >30m old without wiseTransactionId
      await orderExpirationService.expireUnpaidOrders(strapi);

      const { orderNumber } = ctx.params;

      const order = await strapi.documents("api::order.order").findFirst({
        filters: {
          $or: [{ orderNumber }, { documentId: orderNumber }],
        },
        populate: {
          software: {
            populate: ["software_url", "user_manual_pdf"],
          },
          users_permissions_user: true,
        },
      });

      if (!order) {
        return ctx.notFound("Order not found");
      }

      let formattedOrder = order;
      if (order.software) {
        const software_url = formatMediaUrl(
          order.software.software_url,
          order.software.downloadFileUrl,
        );
        const user_manual_pdf = formatMediaUrl(order.software.user_manual_pdf);
        formattedOrder = {
          ...order,
          software: {
            ...order.software,
            software_url,
            user_manual_pdf,
          },
        };
      }

      ctx.send({
        success: true,
        paymentStatus: order.paymentStatus,
        order: formattedOrder,
      });
    },
  }),
);
