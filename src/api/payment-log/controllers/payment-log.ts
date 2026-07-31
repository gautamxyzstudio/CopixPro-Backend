import { factories } from '@strapi/strapi';
import { wiseService } from '../../../services/wiseService';

export default factories.createCoreController('api::payment-log.payment-log', ({ strapi }) => ({
  /**
   * Verify a Wise Payment transaction and record in payment-log
   */
  async verifyWisePayment(ctx: any) {
    try {
      const body = ctx.request.body || {};
      const query = ctx.query || {};

      const wiseTransferId = body.wiseTransferId || body.transactionId || query.wiseTransferId || query.transactionId;
      const email = body.email || query.email;
      const amount = body.amount || query.amount;
      const softwareId = body.softwareId || query.softwareId;
      const orderId = body.orderId || query.orderId;
      const intervalStart = body.intervalStart || query.intervalStart;
      const intervalEnd = body.intervalEnd || query.intervalEnd;

      // 1. Authenticate user or lookup by email
      let user = ctx.state.user;
      if (!user && email) {
        user = await strapi.db.query("plugin::users-permissions.user").findOne({
          where: { email: email.toLowerCase() },
        });
      }

      if (!user) {
        return ctx.unauthorized("Authentication required or valid user email must be provided");
      }

      // 2. Check if Wise transfer ID has already been verified
      if (wiseTransferId) {
        const existingLog = await strapi.documents("api::payment-log.payment-log").findFirst({
          filters: {
            $or: [
              { wiseTransferId: String(wiseTransferId) },
              { transactionId: String(wiseTransferId) },
            ],
          },
        });

        if (existingLog) {
          return ctx.badRequest({
            success: false,
            message: "This Wise transfer ID / transaction has already been verified and processed.",
            data: {
              transactionId: existingLog.transactionId,
              wiseTransferId: existingLog.wiseTransferId,
              paidAt: existingLog.paidAt,
            },
          });
        }
      }

      // 3. Verify transaction against Wise API Balance Statement
      const verifyResult = await wiseService.verifyWiseTransaction({
        wiseTransferId: wiseTransferId ? String(wiseTransferId) : undefined,
        email: user.email,
        amount: amount ? Number(amount) : undefined,
        intervalStart,
        intervalEnd,
      });

      if (!verifyResult.matched || !verifyResult.transaction) {
        return ctx.send({
          success: false,
          message: verifyResult.reason || "Payment verification failed. No matching Wise transaction found.",
        });
      }

      const tx = verifyResult.transaction;

      let order: any = null;

      if (orderId) {
        order = await strapi.documents("api::order.order").findOne({
          documentId: orderId,
        });

        if (!order) {
          return ctx.badRequest({
            success: false,
            message: "Order not found",
          });
        }
      }
      const txId = (tx.referenceNumber || tx.details?.paymentReference || tx.details?.transferId || wiseTransferId || `WISE-${Date.now()}`).toString();
      const txAmount = Number(tx.amount?.value || amount || 0);
      const txCurrency = tx.amount?.currency || "USD";
      const paidAtDate = tx.date ? new Date(tx.date) : new Date();

      // 4. Fetch associated software for download link
      let softwareRecord: any = null;
      if (softwareId) {
        softwareRecord = await strapi.documents("api::software.software").findFirst({
          filters: { id: softwareId },
        });
      }
      if (!softwareRecord) {
        softwareRecord = await strapi.documents("api::software.software").findFirst({});
      }

      // 5. Create payment-log record in Strapi DB
      const paymentLogData: any = {
        transactionId: txId,
        wiseTransferId: wiseTransferId ? String(wiseTransferId) : txId,
        amount: txAmount,
        currency: txCurrency,
        payment_status: "paid",
        paidAt: paidAtDate,
        response: tx,
        users_permissions_user: user.id,
        software: softwareRecord?.id || null,
        order: order?.id || null,
        publishedAt: new Date(),
      };

      const paymentLog = await strapi.documents("api::payment-log.payment-log").create({
        data: paymentLogData,
        status: "published",
      });

      if (order) {
        await strapi.documents("api::order.order").update({
          documentId: order.documentId,
          data: {
            paymentStatus: "paid",
            wiseTransactionId: txId,
            paidAt: paidAtDate,
            paymentLog: paymentLog.id,
          },
          status: "published",
        });
      }

      // 6. Set user active status
      await strapi.db.query("plugin::users-permissions.user").update({
        where: { id: user.id },
        data: { isActive: true },
      });

      return ctx.send({
        success: true,
        message: "Wise payment verified successfully!",
        downloadFileUrl: softwareRecord?.downloadFileUrl || null,
        data: {
          orderId: order?.documentId,
          paymentStatus: order ? "paid" : null,
          paymentLogId: paymentLog.id || paymentLog.documentId,
          transactionId: txId,
          wiseTransferId: wiseTransferId || txId,
          amount: txAmount,
          currency: txCurrency,
          paidAt: paidAtDate,
          downloadFileUrl: softwareRecord?.downloadFileUrl || null,
        },
      });
    } catch (error: any) {
      strapi.log.error("Wise Payment Verification Error:", error);
      return ctx.internalServerError({
        success: false,
        message: "Failed to verify Wise payment",
        error: error.message || error,
      });
    }
  },

  /**
   * Diagnostic endpoint to view active Wise Profiles
   */
  async getWiseProfiles(ctx: any) {
    try {
      const profiles = await wiseService.getProfiles();
      return ctx.send({
        success: true,
        data: profiles,
      });
    } catch (error: any) {
      return ctx.internalServerError({
        success: false,
        message: error.message || "Failed to fetch Wise profiles",
      });
    }
  },

  /**
   * Diagnostic endpoint to view Wise Balance Statement
   */
  async getWiseStatement(ctx: any) {
    try {
      const { currency, intervalStart, intervalEnd } = ctx.query;
      const statement = await wiseService.getBalanceStatement(undefined, undefined, {
        currency,
        intervalStart,
        intervalEnd,
      });
      return ctx.send({
        success: true,
        data: statement,
      });
    } catch (error: any) {
      return ctx.internalServerError({
        success: false,
        message: error.message || "Failed to fetch Wise statement",
      });
    }
  },

  async wiseWebhook(ctx) {
    const body = ctx.request.body || {};
    const transferId =
      body.transferId ||
      body.wiseTransferId ||
      body.transactionId ||
      body.data?.resource?.id ||
      body.resource?.id;

    const result = await wiseService.verifyWiseTransaction({
      wiseTransferId: transferId ? String(transferId) : undefined,
    });

    if (!result.matched) {
      return ctx.send(
        {
          success: false,
          message: result.reason || "No matching transaction found on Wise",
        },
        400,
      );
    }

    return {
      success: true,
      response: result,
    };
  }
}));
