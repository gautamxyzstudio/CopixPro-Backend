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
        couponCode,
        coupon,
        code,
      } = body;

      if (!customerName || !customerEmail || !amount) {
        return ctx.badRequest("Missing required fields");
      }

      // 1. Coupon Validation & Discount Calculation
      const providedCoupon = couponCode || coupon || code;
      let targetCoupon: any = null;
      let finalAmount = Number(amount);
      let discountAmount = 0;

      if (providedCoupon) {
        const codeStr = String(
          typeof providedCoupon === "object"
            ? providedCoupon.code || providedCoupon.id || providedCoupon.documentId
            : providedCoupon
        ).trim();

        if (codeStr) {
          targetCoupon = await strapi
            .documents("api::coupon.coupon")
            .findFirst({
              filters: {
                code: { $eqi: codeStr },
              },
            });

          if (!targetCoupon) {
            return ctx.badRequest("Invalid coupon code. Coupon does not exist.");
          }

          if (!targetCoupon.isActive) {
            return ctx.badRequest("Coupon is not active or has expired.");
          }

          if (
            targetCoupon.maxUses !== null &&
            targetCoupon.maxUses !== undefined &&
            Number(targetCoupon.maxUses) <= 0
          ) {
            return ctx.badRequest("Coupon usage limit has been reached.");
          }

          const discountType = String(targetCoupon.discountType || "percentage").toLowerCase();

          if (discountType === "flat") {
            const flatVal = Number(targetCoupon.flatDiscount || targetCoupon.discountAmount || 0);
            if (flatVal > 0) {
              discountAmount = Math.min(finalAmount, flatVal);
              finalAmount = Math.max(0, finalAmount - discountAmount);
              finalAmount = Number(finalAmount.toFixed(2));
              discountAmount = Number(discountAmount.toFixed(2));
            }
          } else {
            const discountPercentage = Number(targetCoupon.discountPercentage) || 0;
            if (discountPercentage > 0) {
              discountAmount = (finalAmount * discountPercentage) / 100;
              finalAmount = Math.max(0, finalAmount - discountAmount);
              finalAmount = Number(finalAmount.toFixed(2));
              discountAmount = Number(discountAmount.toFixed(2));
            }
          }
        }
      }

      const orderNumber = `CPX-${Date.now()}`;

      // 2. Resolve User (from Authorization header JWT, ctx.state.user, passed payload, or email lookup)
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

      // 3. Resolve Software (from passed payload or fallback to default software record)
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

      // 4. Resolve Payment Link (Use coupon-specific payment link if configured, else default WISE_PAYMENT_LINK)
      const paymentLink =
        (targetCoupon && targetCoupon.paymentLink && targetCoupon.paymentLink.trim()) ||
        process.env.WISE_PAYMENT_LINK;

      // 5. Create Order with linked relations
      const order = await strapi.documents("api::order.order").create({
        data: {
          orderNumber,
          customerName,
          customerEmail,
          amount: finalAmount,
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
          coupon: targetCoupon
            ? targetCoupon.documentId || targetCoupon.id
            : null,
          couponCode: targetCoupon ? targetCoupon.code : null,
          discountAmount: discountAmount > 0 ? discountAmount : null,
          publishedAt: new Date().toISOString(),
        } as any,
        populate: ["software", "users_permissions_user", "coupon"] as any,
        status: "published",
      });

      ctx.send({
        success: true,
        order,
        paymentLink,
        discount: targetCoupon
          ? {
              couponCode: targetCoupon.code,
              discountType: targetCoupon.discountType || "percentage",
              discountPercentage:
                (targetCoupon.discountType || "percentage") === "percentage"
                  ? targetCoupon.discountPercentage
                  : null,
              flatDiscount:
                targetCoupon.discountType === "flat"
                  ? targetCoupon.flatDiscount
                  : null,
              originalAmount: Number(amount),
              discountAmount,
              finalAmount,
            }
          : null,
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
          coupon: true,
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
          coupon: true,
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
