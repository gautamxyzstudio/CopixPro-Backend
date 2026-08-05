import { factories } from "@strapi/strapi";
import notificationService from "../../../services/notificationService";

async function resolveUserFromCtx(strapi: any, ctx: any): Promise<any> {
  let user = ctx.state.user;
  const authHeader =
    ctx.headers?.authorization || ctx.request?.headers?.authorization;

  if (!user && authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.split(" ")[1];
      const decoded: any = await strapi
        .plugin("users-permissions")
        .service("jwt")
        .verify(token);

      if (decoded?.id) {
        user = await strapi.db.query("plugin::users-permissions.user").findOne({
          where: { id: decoded.id },
          populate: ["role"],
        });
      }
    } catch (err) {
      strapi.log.warn("Invalid JWT token in notification controller");
    }
  }

  return user;
}

export default factories.createCoreController(
  "api::notification.notification",
  ({ strapi }) => ({
    /**
     * GET /api/notifications
     * Retrieve notifications for dashboard
     */
    async find(ctx) {
      try {
        const currentUser = await resolveUserFromCtx(strapi, ctx);

        if (!currentUser) {
          return ctx.unauthorized("Authentication required");
        }

        // Clean up notifications created more than 1 week ago
        await notificationService.cleanupOldNotifications(strapi);

        const notifications = await strapi
          .documents("api::notification.notification")
          .findMany({
            sort: ["createdAt:desc"],
          });

        return ctx.send(notifications);
      } catch (error: any) {
        strapi.log.error("Find notifications error:", error);
        return ctx.internalServerError("Failed to fetch notifications");
      }
    },

    /**
     * PUT /api/notifications/:id/read
     * Mark a single notification as read
     */
    async markAsRead(ctx) {
      try {
        const currentUser = await resolveUserFromCtx(strapi, ctx);

        if (!currentUser) {
          return ctx.unauthorized("Authentication required");
        }

        const { id } = ctx.params;

        const updated = await strapi
          .documents("api::notification.notification")
          .update({
            documentId: id as any,
            data: {
              isRead: true,
            } as any,
            status: "published",
          });

        return ctx.send({
          success: true,
          message: "Notification marked as read",
          data: updated,
        });
      } catch (error: any) {
        strapi.log.error("Mark notification read error:", error);
        return ctx.internalServerError("Failed to update notification");
      }
    },

    /**
     * PUT /api/notifications/read-all
     * Mark all unread notifications as read
     */
    async markAllAsRead(ctx) {
      try {
        const currentUser = await resolveUserFromCtx(strapi, ctx);

        if (!currentUser) {
          return ctx.unauthorized("Authentication required");
        }

        const unreadList = await strapi
          .documents("api::notification.notification")
          .findMany({
            filters: { isRead: false },
          });

        for (const item of unreadList) {
          const docId = item.documentId || item.id;
          await strapi.documents("api::notification.notification").update({
            documentId: docId as any,
            data: { isRead: true } as any,
            status: "published",
          });
        }

        return ctx.send({
          success: true,
          message: "All notifications marked as read",
          count: unreadList.length,
        });
      } catch (error: any) {
        strapi.log.error("Mark all notifications read error:", error);
        return ctx.internalServerError("Failed to update notifications");
      }
    },
  }),
);
