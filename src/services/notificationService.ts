import { Core } from "@strapi/strapi";

export interface CreateNotificationParams {
  title: string;
  message: string;
  type: "USER_ACTIVATED" | "MACHINE_ID_CREATED" | "MACHINE_ID_UPDATED";
  user?: any;
  data?: any;
}

class NotificationService {
  /**
   * Create a new notification record in the notification collection
   */
  public async createNotification(
    strapi: Core.Strapi,
    params: CreateNotificationParams
  ): Promise<any> {
    try {
      const { title, message, type, user, data } = params;

      const userId = user ? user.documentId || user.id : null;

      const notification = await strapi
        .documents("api::notification.notification")
        .create({
          data: {
            title,
            message,
            type,
            isRead: false,
            data: data || {},
            users_permissions_user: userId,
          } as any,
          populate: ["users_permissions_user"],
          status: "published",
        });

      strapi.log.info(
        `[NotificationService] Notification created (${type}): ${title}`
      );
      return notification;
    } catch (error: any) {
      strapi.log.error(
        "[NotificationService] Error creating notification:",
        error
      );
      return null;
    }
  }

  /**
   * Type 1 Notification: When a new Client user is created or updated with isActive: true
   */
  public async notifyUserActivated(
    strapi: Core.Strapi,
    user: any
  ): Promise<any> {
    const firstName = user.firstName ? String(user.firstName).trim() : "";
    const lastName = user.lastName ? String(user.lastName).trim() : "";
    const name =
      [firstName, lastName].filter(Boolean).join(" ") ||
      user.username ||
      user.email ||
      "Client";

    return this.createNotification(strapi, {
      title: "New Client Activated",
      message: `Client ${name} (${user.email || "N/A"}) is now active.`,
      type: "USER_ACTIVATED",
      user,
      data: {
        userId: user.id,
        userDocumentId: user.documentId,
        email: user.email,
        name,
        activatedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Type 2 Notification: When a Client user creates a new Machine ID or updates an existing Machine ID
   */
  public async notifyMachineIdChanged(
    strapi: Core.Strapi,
    params: {
      action: "created" | "updated";
      user: any;
      newMachineId: string;
      previousMachineId?: any;
      wiseTransactionId?: string;
    }
  ): Promise<any> {
    const { action, user, newMachineId, previousMachineId, wiseTransactionId } =
      params;

    const firstName = user.firstName ? String(user.firstName).trim() : "";
    const lastName = user.lastName ? String(user.lastName).trim() : "";
    const name =
      [firstName, lastName].filter(Boolean).join(" ") ||
      user.username ||
      user.email ||
      "Client";

    const isCreate = action === "created";
    const type = isCreate ? "MACHINE_ID_CREATED" : "MACHINE_ID_UPDATED";
    const actionLabel = isCreate ? "created new" : "updated";

    return this.createNotification(strapi, {
      title: isCreate ? "New Machine ID Created" : "Machine ID Updated",
      message: `Client ${name} (${user.email || "N/A"}) ${actionLabel} Machine ID: ${newMachineId}`,
      type,
      user,
      data: {
        action,
        userId: user.id,
        userDocumentId: user.documentId,
        email: user.email,
        name,
        newMachineId,
        previousMachineId,
        wiseTransactionId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Delete notifications created more than 1 week ago (7 days)
   */
  public async cleanupOldNotifications(strapi: Core.Strapi): Promise<number> {
    try {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const oldNotifications = await strapi
        .documents("api::notification.notification")
        .findMany({
          filters: {
            createdAt: { $lt: oneWeekAgo.toISOString() },
          },
        });

      if (!oldNotifications || oldNotifications.length === 0) {
        return 0;
      }

      let deletedCount = 0;

      for (const item of oldNotifications) {
        const docId = item.documentId || item.id;
        await strapi
          .documents("api::notification.notification")
          .delete({
            documentId: docId as any,
          });
        deletedCount++;
      }

      if (deletedCount > 0) {
        strapi.log.info(
          `[NotificationService] Automatically deleted ${deletedCount} notification(s) created >1 week ago.`
        );
      }

      return deletedCount;
    } catch (error: any) {
      strapi.log.error(
        "[NotificationService] Error cleaning up old notifications:",
        error
      );
      return 0;
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;
