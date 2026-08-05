import { Core } from "@strapi/strapi";
import softwareEmailService from "../src/services/softwareEmailService";
import orderExpirationService from "../src/services/orderExpirationService";
import notificationService from "../src/services/notificationService";

export default {
  /**
   * Run every 1 minute to check for unpaid orders, process software download emails,
   * and automatically clean up notifications older than 1 week (7 days).
   */
  "*/1 * * * *": async ({ strapi }: { strapi: Core.Strapi }) => {
    // 1. Expire orders created > 30 minutes ago without wiseTransactionId
    const expiredCount = await orderExpirationService.expireUnpaidOrders(strapi);
    if (expiredCount > 0) {
      strapi.log.info(`[Cron] Expired ${expiredCount} order(s) without wiseTransactionId created >30m ago.`);
    }

    // 2. Automatically delete notifications created > 1 week ago
    await notificationService.cleanupOldNotifications(strapi);

    // 3. Process software download emails for paid orders
    const result = await softwareEmailService.processPendingSoftwareDownloadEmails(strapi);
    if (result.processed > 0) {
      strapi.log.info(`[Cron] Software Download Email Processor finished. Processed: ${result.processed}, Sent: ${result.success}`);
    }
  },
};

