import { Core } from "@strapi/strapi";

export interface SoftwareEmailData {
  customerName: string;
  customerEmail: string;
  orderNumber: string;
  amount: number;
  currency: string;
  paidAt: Date | string;
  wiseTransactionId?: string;
  softwareName?: string;
  downloadFileUrl?: string;
}

class SoftwareEmailService {
  /**
   * Generates a modern HTML email template for software download & machine ID registration
   */
  public generateEmailHtml(data: SoftwareEmailData): string {
    const {
      customerName,
      customerEmail,
      orderNumber,
      amount,
      currency,
      paidAt,
      wiseTransactionId,
      softwareName = "CopixPro Software Package",
      downloadFileUrl = process.env.SOFTWARE_DOWNLOAD_URL ||
        "https://copixpro.com/download",
    } = data;

    const formattedDate = paidAt
      ? new Date(paidAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : new Date().toLocaleDateString();

    const formattedAmount = `${Number(amount).toFixed(2)} ${currency || "USD"}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your CopixPro Software Download & Registration Instructions</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 30px 10px;">
    <tr>
      <td align="center">
        <!-- Main Container Table -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);">
          
          <!-- Header Banner -->
          <tr>
            <td align="center">
              <div style="padding: 32px 24px; background-color: #059669">
                <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">CopixPro Software Ready!</h1>
                <p style="margin: 8px 0 0 0; font-size: 14px; color: #d1fae5; font-weight: 500;">Order Confirmed & Software Download Available</p>
              </div>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td style="padding: 32px 28px;">
              <div style="font-size: 17px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">Hello ${customerName},</div>
              <div style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 24px;">
                Thank you for choosing CopixPro! Your payment has been verified successfully. Your software package is ready for download below along with your Machine ID registration guide.
              </div>

              <!-- Order Summary Card -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 28px;">
                <tr>
                  <td style="padding: 18px 20px;">
                    <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; color: #059669; margin-bottom: 12px;">Order Information</div>
                    
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="font-size: 14px;">
                      <tr>
                        <td style="padding: 7px 0; color: #64748b; font-weight: 500;">Order Number:</td>
                        <td align="right" style="padding: 7px 0; color: #0f172a; font-weight: 700; font-family: monospace; font-size: 14px;">${orderNumber}</td>
                      </tr>
                      <tr>
                        <td style="padding: 7px 0; color: #64748b; font-weight: 500; border-top: 1px dashed #e2e8f0;">Paid Amount:</td>
                        <td align="right" style="padding: 7px 0; color: #059669; font-weight: 800; font-size: 15px; border-top: 1px dashed #e2e8f0;">${formattedAmount}</td>
                      </tr>
                      <tr>
                        <td style="padding: 7px 0; color: #64748b; font-weight: 500; border-top: 1px dashed #e2e8f0;">Payment Date:</td>
                        <td align="right" style="padding: 7px 0; color: #0f172a; font-weight: 600; border-top: 1px dashed #e2e8f0;">${formattedDate}</td>
                      </tr>
                      ${
                        wiseTransactionId
                          ? `
                      <tr>
                        <td style="padding: 7px 0; color: #64748b; font-weight: 500; border-top: 1px dashed #e2e8f0;">Transaction Reference:</td>
                        <td align="right" style="padding: 7px 0; color: #0f172a; font-weight: 600; font-family: monospace; font-size: 13px; border-top: 1px dashed #e2e8f0;">${wiseTransactionId}</td>
                      </tr>
                      `
                          : ""
                      }
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Software Download CTA Section -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ecfdf5; border: 1.5px solid #a7f3d0; border-radius: 12px; margin-bottom: 32px;">
                <tr>
                  <td align="center" style="padding: 24px 20px;">
                    <div style="font-size: 18px; font-weight: 800; color: #065f46; margin-bottom: 6px;">📦 ${softwareName}</div>
                    <div style="font-size: 13px; color: #047857; margin-bottom: 18px;">Includes full software binary, installer, and setup documentation.</div>
                    
                    <a href="${downloadFileUrl}" target="_blank" style="background-color: #059669; color: #ffffff !important; display: inline-block; padding: 14px 32px; border-radius: 8px; font-weight: 700; text-decoration: none; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(5, 150, 105, 0.3);">
                      Download Software (ZIP)
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Machine ID Guide Header -->
              <div style="font-size: 16px; font-weight: 800; color: #0f172a; margin-bottom: 18px;">
                📌 Machine ID Registration Guide
              </div>

              <!-- Steps List Table -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 28px;">
                <!-- Step 1 -->
                <tr>
                  <td width="36" valign="top" style="padding-bottom: 18px;">
                    <table border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="32" height="32" align="center" valign="middle" style="background-color: #059669; color: #ffffff; font-weight: 800; font-size: 14px; border-radius: 50%;">1</td>
                      </tr>
                    </table>
                  </td>
                  <td valign="top" style="padding-left: 14px; padding-bottom: 18px; font-size: 14px; line-height: 1.5; color: #334155;">
                    <strong style="color: #0f172a; font-size: 15px;">Download & Extract Archive</strong><br>
                    Download the <span style="background-color: #f1f5f9; color: #059669; font-family: monospace; padding: 2px 6px; border-radius: 4px; font-size: 13px; font-weight: 600;">ZIP file</span> using the button above and extract its contents on your target computer.
                  </td>
                </tr>

                <!-- Step 2 -->
                <tr>
                  <td width="36" valign="top" style="padding-bottom: 18px;">
                    <table border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="32" height="32" align="center" valign="middle" style="background-color: #059669; color: #ffffff; font-weight: 800; font-size: 14px; border-radius: 50%;">2</td>
                      </tr>
                    </table>
                  </td>
                  <td valign="top" style="padding-left: 14px; padding-bottom: 18px; font-size: 14px; line-height: 1.5; color: #334155;">
                    <strong style="color: #0f172a; font-size: 15px;">Launch Software & Find Machine ID</strong><br>
                    Open the CopixPro application on your system. Navigate to the <strong>License / Activation</strong> panel to copy your unique system <span style="background-color: #f1f5f9; color: #059669; font-family: monospace; padding: 2px 6px; border-radius: 4px; font-size: 13px; font-weight: 600;">Machine ID</span>.
                  </td>
                </tr>

                <!-- Step 3 -->
                <tr>
                  <td width="36" valign="top" style="padding-bottom: 18px;">
                    <table border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="32" height="32" align="center" valign="middle" style="background-color: #059669; color: #ffffff; font-weight: 800; font-size: 14px; border-radius: 50%;">3</td>
                      </tr>
                    </table>
                  </td>
                  <td valign="top" style="padding-left: 14px; padding-bottom: 18px; font-size: 14px; line-height: 1.5; color: #334155;">
                    <strong style="color: #0f172a; font-size: 15px;">Register Machine ID in Dashboard</strong><br>
                    Log into your CopixPro web dashboard using <strong style="color: #0f172a;">${customerEmail}</strong> and submit your copied Machine ID to activate your software license.
                  </td>
                </tr>

                <!-- Step 4 -->
                <tr>
                  <td width="36" valign="top">
                    <table border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="32" height="32" align="center" valign="middle" style="background-color: #059669; color: #ffffff; font-weight: 800; font-size: 14px; border-radius: 50%;">4</td>
                      </tr>
                    </table>
                  </td>
                  <td valign="top" style="padding-left: 14px; font-size: 14px; line-height: 1.5; color: #334155;">
                    <strong style="color: #0f172a; font-size: 15px;">Enjoy Full Features</strong><br>
                    Once your Machine ID is registered, your application status will automatically update to <strong style="color: #059669;">Active</strong>.
                  </td>
                </tr>
              </table>

              <!-- Assistance Note -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f0fdf4; border-left: 4px solid #059669; border-radius: 6px;">
                <tr>
                  <td style="padding: 14px 16px; font-size: 13px; color: #166534; line-height: 1.5;">
                    💡 <strong>Need Assistance?</strong> If you experience any issues downloading the ZIP file or registering your Machine ID, please reply to this email or contact support.
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background-color: #f8fafc; padding: 24px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.5;">
              <p style="margin: 0 0 6px 0;">&copy; ${new Date().getFullYear()} CopixPro. All rights reserved.</p>
              <p style="margin: 0;">This email was automatically sent regarding your order <strong style="color: #475569;">${orderNumber}</strong>.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /**
   * Send software download email for a specific order
   */
  public async sendSoftwareDownloadEmail(
    strapi: Core.Strapi,
    order: any,
  ): Promise<boolean> {
    try {
      const recipientEmail =
        order.customerEmail || order.users_permissions_user?.email;

      if (!recipientEmail) {
        strapi.log.warn(
          `[SoftwareEmailService] Order ${order.orderNumber || order.id} has no customer email address.`,
        );
        return false;
      }

      // Resolve software download link and name
      let softwareName = "CopixPro Software Package";
      let downloadFileUrl = process.env.SOFTWARE_DOWNLOAD_URL || "";

      if (order.software && typeof order.software === "object") {
        if (order.software.name) softwareName = order.software.name;
        if (order.software.downloadFileUrl)
          downloadFileUrl = order.software.downloadFileUrl;
      }

      if (!downloadFileUrl) {
        // Fallback software search
        try {
          const defaultSoftware: any = await strapi
            .documents("api::software.software")
            .findFirst({});
          if (defaultSoftware) {
            if (defaultSoftware.name) softwareName = defaultSoftware.name;
            if (defaultSoftware.downloadFileUrl)
              downloadFileUrl = defaultSoftware.downloadFileUrl;
          }
        } catch (e) {
          // ignore fallback error
        }
      }

      if (!downloadFileUrl) {
        downloadFileUrl = "https://copixpro.com/download";
      }

      const emailHtml = this.generateEmailHtml({
        customerName: order.customerName || "Valued Customer",
        customerEmail: recipientEmail,
        orderNumber: order.orderNumber || `CPX-${order.id}`,
        amount: order.amount || 0,
        currency: order.currency || "USD",
        paidAt: order.paidAt || new Date(),
        wiseTransactionId: order.wiseTransactionId,
        softwareName,
        downloadFileUrl,
      });

      const fromEmail =
        process.env.BREVO_FROM_EMAIL ||
        process.env.DEFAULT_FROM_EMAIL ||
        "no-reply@copixpro.com";

      await strapi
        .plugin("email")
        .service("email")
        .send({
          to: recipientEmail,
          from: fromEmail,
          subject: `Your CopixPro Software Download & License Guide (Order #${order.orderNumber || order.id})`,
          html: emailHtml,
        });

      // Update Order to mark download email sent
      const docId = order.documentId || order.id;
      await strapi.documents("api::order.order").update({
        documentId: docId as any,
        data: {
          downloadEmailSent: true,
          downloadEmailSentAt: new Date().toISOString(),
        } as any,
      });

      strapi.log.info(
        `[SoftwareEmailService] Software download email successfully sent for Order ${order.orderNumber || order.id} to ${recipientEmail}`,
      );
      return true;
    } catch (error: any) {
      strapi.log.error(
        `[SoftwareEmailService] Error sending software download email for Order ${order.orderNumber || order.id}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Find orders where paymentStatus is 'paid', paidAt is not null, downloadEmailSent is false/null,
   * and paidAt is at least 30 minutes old (30-45+ minutes after payment).
   */
  public async processPendingSoftwareDownloadEmails(
    strapi: Core.Strapi,
  ): Promise<{ processed: number; success: number }> {
    try {
      // Find orders paid at least 30 minutes ago
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      const pendingOrders = await strapi
        .documents("api::order.order")
        .findMany({
          filters: {
            paymentStatus: { $eq: "paid" },
            paidAt: { $notNull: true, $lte: thirtyMinutesAgo.toISOString() },
            $or: [
              { downloadEmailSent: { $null: true } },
              { downloadEmailSent: { $eq: false } },
            ],
          },
          populate: ["software", "users_permissions_user"],
        });

      if (!pendingOrders || pendingOrders.length === 0) {
        return { processed: 0, success: 0 };
      }

      strapi.log.info(
        `[SoftwareEmailService] Found ${pendingOrders.length} paid order(s) eligible for software download email dispatch (paid 30+ mins ago).`,
      );

      let successCount = 0;
      for (const order of pendingOrders) {
        const sent = await this.sendSoftwareDownloadEmail(strapi, order);
        if (sent) successCount++;
      }

      return {
        processed: pendingOrders.length,
        success: successCount,
      };
    } catch (error: any) {
      strapi.log.error(
        "[SoftwareEmailService] Error processing pending software download emails:",
        error,
      );
      return { processed: 0, success: 0 };
    }
  }
}

export const softwareEmailService = new SoftwareEmailService();
export default softwareEmailService;
