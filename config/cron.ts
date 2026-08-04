import { Core } from "@strapi/strapi";
import softwareEmailService from "../src/services/softwareEmailService";

export default {
  /**
   * Run every 5 minutes to check for paid orders where paidAt is >= 30 mins ago
   * and send the software download email with instructions.
   */
  "*/5 * * * *": async ({ strapi }: { strapi: Core.Strapi }) => {
    strapi.log.info("[Cron] Running scheduled job: Software Download Email Processor...");
    const result = await softwareEmailService.processPendingSoftwareDownloadEmails(strapi);
    if (result.processed > 0) {
      strapi.log.info(`[Cron] Software Download Email Processor finished. Processed: ${result.processed}, Sent: ${result.success}`);
    }
  },
};
