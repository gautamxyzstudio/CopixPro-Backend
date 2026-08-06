import { factories } from "@strapi/strapi";
import { wiseService } from "../../../services/wiseService";

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
  "api::payment-log.payment-log",
  ({ strapi }) => ({
    /**
     * Verify a Wise Payment transaction and record in payment-log
     */
    async verifyWisePayment(ctx: any) {
      try {
        const body = ctx.request.body || {};
        const query = ctx.query || {};

        const wiseTransferId =
          body.wiseTransferId ||
          body.transactionId ||
          query.wiseTransferId ||
          query.transactionId;
        const email = body.email || query.email;
        const amount = body.amount || query.amount;
        const softwareId = body.softwareId || query.softwareId;
        const orderId = body.orderId || query.orderId;
        const intervalStart = body.intervalStart || query.intervalStart;
        const intervalEnd = body.intervalEnd || query.intervalEnd;

        // 1. Authenticate user (from ctx.state.user, JWT Authorization header, or email lookup)
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
              "Invalid JWT token in verifyWisePayment authorization header",
            );
          }
        }

        if (!user && email) {
          user = await strapi.db
            .query("plugin::users-permissions.user")
            .findOne({
              where: { email: email.toLowerCase().trim() },
            });
        }

        // Fetch order early if orderId is provided to fallback user lookup
        let order: any = null;
        if (orderId) {
          const orderIdStr = String(orderId).trim();
          const orderFilter: any = /^\d+$/.test(orderIdStr)
            ? {
                $or: [
                  { id: Number(orderIdStr) },
                  { documentId: orderIdStr },
                  { orderNumber: orderIdStr },
                ],
              }
            : {
                $or: [{ orderNumber: orderIdStr }, { documentId: orderIdStr }],
              };

          order = await strapi.documents("api::order.order").findFirst({
            filters: orderFilter,
            populate: ["users_permissions_user", "software"],
          });

          if (!order) {
            return ctx.send(
              {
                success: false,
                message: "Order not found",
              },
              400,
            );
          }

          if (!user && order.users_permissions_user) {
            user = order.users_permissions_user;
          }

          if (!user && order.customerEmail) {
            user = await strapi.db
              .query("plugin::users-permissions.user")
              .findOne({
                where: { email: order.customerEmail.toLowerCase().trim() },
              });
          }
        }

        if (!user) {
          return ctx.send(
            {
              success: false,
              message:
                "Authentication required or valid user email must be provided",
            },
            401,
          );
        }

        // 2. Check if Wise transfer ID has already been verified
        if (wiseTransferId) {
          const existingLog = await strapi
            .documents("api::payment-log.payment-log")
            .findFirst({
              filters: {
                $or: [
                  { wiseTransferId: String(wiseTransferId) },
                  { transactionId: String(wiseTransferId) },
                ],
              },
            });

          if (existingLog) {
            return ctx.send(
              {
                success: false,
                message: "This Wise transfer ID has already been used.",
                data: {
                  transactionId: existingLog.transactionId,
                  wiseTransferId: existingLog.wiseTransferId,
                  paidAt: existingLog.paidAt,
                },
              },
              400,
            );
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
          return ctx.send(
            {
              success: false,
              message:
                verifyResult.reason ||
                "Payment verification failed. No matching Wise transaction found.",
            },
            400,
          );
        }

        const tx = verifyResult.transaction;

        const txId = (
          tx.referenceNumber ||
          tx.details?.paymentReference ||
          tx.details?.transferId ||
          wiseTransferId ||
          `WISE-${Date.now()}`
        ).toString();
        const txAmount = Number(tx.amount?.value || amount || 0);
        const txCurrency = tx.amount?.currency || "USD";
        const paidAtDate = tx.date ? new Date(tx.date) : new Date();

        // Check if the matched transaction ID has already been verified in payment logs
        const existingTxLog = await strapi
          .documents("api::payment-log.payment-log")
          .findFirst({
            filters: {
              $or: [
                { wiseTransferId: String(txId) },
                { transactionId: String(txId) },
              ],
            },
          });

        if (existingTxLog) {
          return ctx.send(
            {
              success: false,
              message: "This Wise transfer ID has already been used.",
              data: {
                transactionId: existingTxLog.transactionId,
                wiseTransferId: existingTxLog.wiseTransferId,
                paidAt: existingTxLog.paidAt,
              },
            },
            400,
          );
        }

        // 4. Fetch associated software for download link
        let softwareRecord: any = null;
        const targetSoftwareId =
          softwareId ||
          (typeof order?.software === "object"
            ? order.software.documentId || order.software.id
            : order?.software);

        if (targetSoftwareId) {
          softwareRecord = await strapi
            .documents("api::software.software")
            .findFirst({
              filters: getIdOrDocumentIdFilter(targetSoftwareId),
              populate: ["software_url", "user_manual_pdf"],
            });
        }
        if (!softwareRecord) {
          softwareRecord = await strapi
            .documents("api::software.software")
            .findFirst({
              populate: ["software_url", "user_manual_pdf"],
            });
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
          users_permissions_user: user.documentId || user.id,
          software: softwareRecord
            ? softwareRecord.documentId || softwareRecord.id
            : null,
          order: order ? order.documentId || order.id : null,
          publishedAt: new Date(),
        };

        const paymentLog = await strapi
          .documents("api::payment-log.payment-log")
          .create({
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
              paymentLog: paymentLog.documentId || paymentLog.id,
              users_permissions_user: user.documentId || user.id,
              software: softwareRecord
                ? softwareRecord.documentId || softwareRecord.id
                : null,
            },
            status: "published",
          });
        }

        // 6. Set user active status
        await strapi.db.query("plugin::users-permissions.user").update({
          where: { id: user.id },
          data: { isActive: true },
        });

        const softwareUrlFormatted = formatMediaUrl(
          softwareRecord?.software_url,
        );
        const userManualPdfFormatted = formatMediaUrl(
          softwareRecord?.user_manual_pdf,
        );

        return ctx.send({
          success: true,
          message: "Wise payment verified successfully!",
          software_url: softwareUrlFormatted,
          user_manual_pdf: userManualPdfFormatted,
          data: {
            orderId: order?.documentId,
            paymentStatus: order ? "paid" : null,
            paymentLogId: paymentLog.id || paymentLog.documentId,
            transactionId: txId,
            wiseTransferId: wiseTransferId || txId,
            amount: txAmount,
            currency: txCurrency,
            paidAt: paidAtDate,
            software_url: softwareUrlFormatted,
            user_manual_pdf: userManualPdfFormatted,
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
        const statement = await wiseService.getBalanceStatement(
          undefined,
          undefined,
          {
            currency,
            intervalStart,
            intervalEnd,
          },
        );
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
    },
  }),
);
