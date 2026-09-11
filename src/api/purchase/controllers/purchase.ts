import { handleControllerError } from "../../../utils/errorHandler";

function formatMediaUrl(media: any, fallbackUrl?: string | null): string | null {
  if (media && typeof media === "object" && media.url) {
    const url = String(media.url).trim();
    if (url) {
      if (url.startsWith("http://") || url.startsWith("https://")) {
        return url;
      }
      const backendUrl = (process.env.BACKEND_URL || "http://localhost:1338").replace(/\/$/, "");
      const cleanUrl = url.startsWith("/") ? url : `/${url}`;
      return `${backendUrl}${cleanUrl}`;
    }
  }
  if (fallbackUrl && typeof fallbackUrl === "string" && fallbackUrl.trim()) {
    const url = fallbackUrl.trim();
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    const backendUrl = (process.env.BACKEND_URL || "http://localhost:1338").replace(/\/$/, "");
    const cleanUrl = url.startsWith("/") ? url : `/${url}`;
    return `${backendUrl}${cleanUrl}`;
  }
  return null;
}

export default {
  async getLatestPurchase(ctx: any) {
    try {
      const user = ctx.state.user;

      if (!user) {
        return ctx.unauthorized("User not authenticated");
      }

      const latestPaymentLog = await strapi
        .documents("api::payment-log.payment-log")
        .findFirst({
          filters: {
            users_permissions_user: {
              id: user.id,
            },
            payment_status: "paid",
          },
          populate: {
            software: {
              populate: ["software_url", "user_manual_pdf"],
            },
          },
        });

      if (!latestPaymentLog) {
        return ctx.send({
          success: false,
          software_url: null,
          user_manual_pdf: null,
        });
      }

      const software = latestPaymentLog.software;

      return ctx.send({
        success: true,
        software_url: formatMediaUrl(
          software?.software_url,
          software?.downloadFileUrl,
        ),
        user_manual_pdf: formatMediaUrl(software?.user_manual_pdf),
      });
    } catch (error) {
      strapi.log.error("Get latest purchase error:", error);
      return handleControllerError(ctx, error, "Something went wrong");
    }
  },
};
