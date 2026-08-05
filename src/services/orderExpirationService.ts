import { Core } from "@strapi/strapi";

class OrderExpirationService {
  /**
   * Check and update paymentStatus to 'expired' for orders created 30+ minutes ago
   * where wiseTransactionId is null or empty, and paymentStatus is pending or processing.
   */
  public async expireUnpaidOrders(strapi: Core.Strapi): Promise<number> {
    try {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      const pendingOrders = await strapi
        .documents("api::order.order")
        .findMany({
          filters: {
            paymentStatus: { $in: ["pending", "processing"] },
            createdAt: { $lte: thirtyMinutesAgo.toISOString() },
          },
        });

      if (!pendingOrders || pendingOrders.length === 0) {
        return 0;
      }

      let expiredCount = 0;

      for (const order of pendingOrders) {
        const wiseTxId = order.wiseTransactionId;
        const isWiseTxEmpty =
          !wiseTxId ||
          typeof wiseTxId !== "string" ||
          wiseTxId.trim() === "";

        if (isWiseTxEmpty) {
          const docId = order.documentId || order.id;

          await strapi.documents("api::order.order").update({
            documentId: docId as any,
            data: {
              paymentStatus: "expired",
            } as any,
            status: "published",
          });

          strapi.log.info(
            `[OrderExpirationService] Order ${order.orderNumber || order.id} marked as EXPIRED (created >30m ago with no wiseTransactionId).`
          );
          expiredCount++;
        }
      }

      return expiredCount;
    } catch (error: any) {
      strapi.log.error(
        "[OrderExpirationService] Error expiring unpaid orders:",
        error
      );
      return 0;
    }
  }
}

export const orderExpirationService = new OrderExpirationService();
export default orderExpirationService;
