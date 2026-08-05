import { Core } from "@strapi/strapi";

export interface MachineIdNotificationData {
  action: "created" | "updated";
  clientUser: {
    id?: number | string;
    email?: string;
    username?: string;
    firstName?: string;
    lastName?: string;
  };
  newMachineId: string;
  previousMachineId?: string | any[];
  wiseTransactionId?: string;
  updatedAt?: string | Date;
}

class AdminNotificationService {
  /**
   * Send email notification to all Admin / Authenticated / Superadmin users
   * when any Client creates or updates a Machine ID.
   */
  public async notifyAdminsOnMachineIdChange(
    strapi: Core.Strapi,
    data: MachineIdNotificationData
  ): Promise<{ sent: number; totalAdmins: number }> {
    try {
      // 1. Fetch admin/staff users (roles: Authenticated, Admin, Super Admin, Superadmin, Administrator)
      const adminUsers = await strapi.db
        .query("plugin::users-permissions.user")
        .findMany({
          where: {
            role: {
              name: {
                $in: [
                  "Authenticated",
                  "Admin",
                  "Super Admin",
                  "Superadmin",
                  "Administrator",
                ],
              },
            },
          },
          populate: ["role"],
        });

      if (!adminUsers || adminUsers.length === 0) {
        strapi.log.info(
          "[AdminNotificationService] No admin/authenticated users found to notify."
        );
        return { sent: 0, totalAdmins: 0 };
      }

      // Filter out duplicate or empty email addresses
      const adminEmails: string[] = Array.from(
        new Set(
          adminUsers
            .map((u: any) =>
              u.email ? String(u.email).toLowerCase().trim() : ""
            )
            .filter(Boolean)
        )
      );

      if (adminEmails.length === 0) {
        return { sent: 0, totalAdmins: 0 };
      }

      // 2. Format details for email
      const clientName =
        [data.clientUser.firstName, data.clientUser.lastName]
          .filter(Boolean)
          .join(" ") ||
        data.clientUser.username ||
        data.clientUser.email ||
        "Client";

      const actionText = data.action === "created" ? "Created" : "Updated";
      const subject = `[CopixPro Admin Alert] Machine ID ${actionText} by ${clientName}`;

      const fromEmail =
        process.env.BREVO_FROM_EMAIL ||
        process.env.DEFAULT_FROM_EMAIL ||
        "no-reply@copixpro.com";

      const formattedTimestamp = new Date(
        data.updatedAt || Date.now()
      ).toLocaleString("en-US", {
        timeZone: "UTC",
        dateStyle: "medium",
        timeStyle: "medium",
      });

      // Format previous Machine ID (display only the last / most recent previous Machine ID)
      let prevIdsStr = "None";
      if (
        Array.isArray(data.previousMachineId) &&
        data.previousMachineId.length > 0
      ) {
        const lastItem =
          data.previousMachineId[data.previousMachineId.length - 1];
        const lastId =
          typeof lastItem === "string" ? lastItem : lastItem?.machineId;
        if (lastId && String(lastId).trim()) {
          prevIdsStr = String(lastId).trim();
        }
      } else if (
        typeof data.previousMachineId === "string" &&
        data.previousMachineId.trim()
      ) {
        prevIdsStr = data.previousMachineId.trim();
      }

      const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Machine ID ${actionText} Notification</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 30px 10px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);">
          
          <!-- Header Banner -->
          <tr>
            <td align="center" style="background-color: #ff6a00; padding: 24px;">
              <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff;">CopixPro Admin Notification</h2>
              <p style="margin: 6px 0 0 0; font-size: 14px; color: #fff3eb; font-weight: 500;">Client Machine ID ${actionText}</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 28px;">
              <p style="font-size: 15px; line-height: 1.6; margin-top: 0;">
                Hello Administrator,
              </p>
              <p style="font-size: 15px; line-height: 1.6; color: #475569;">
                A client user has <strong>${data.action}</strong> their Machine ID registration. Details are below:
              </p>

              <!-- Details Table -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; border-radius: 12px; border: 1px solid #cbd5e1; margin: 20px 0; font-size: 14px;">
                <tr>
                  <td style="padding: 12px 16px; font-weight: 600; color: #64748b; border-bottom: 1px solid #e2e8f0;">Client Name:</td>
                  <td style="padding: 12px 16px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${clientName}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; font-weight: 600; color: #64748b; border-bottom: 1px solid #e2e8f0;">Client Email:</td>
                  <td style="padding: 12px 16px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${data.clientUser.email || "N/A"}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; font-weight: 600; color: #64748b; border-bottom: 1px solid #e2e8f0;">New Machine ID:</td>
                  <td style="padding: 12px 16px; font-weight: 800; color: #ff6a00; font-family: monospace; border-bottom: 1px solid #e2e8f0;">${data.newMachineId}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; font-weight: 600; color: #64748b; border-bottom: 1px solid #e2e8f0;">Previous Machine ID:</td>
                  <td style="padding: 12px 16px; font-weight: 600; color: #334155; font-family: monospace; border-bottom: 1px solid #e2e8f0;">${prevIdsStr}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; font-weight: 600; color: #64748b; border-bottom: 1px solid #e2e8f0;">Wise Transaction ID:</td>
                  <td style="padding: 12px 16px; font-weight: 600; color: #0f172a; font-family: monospace; border-bottom: 1px solid #e2e8f0;">${data.wiseTransactionId || "N/A"}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; font-weight: 600; color: #64748b;">Timestamp (UTC):</td>
                  <td style="padding: 12px 16px; font-weight: 600; color: #0f172a;">${formattedTimestamp}</td>
                </tr>
              </table>

              <p style="font-size: 13px; color: #64748b; margin-bottom: 0;">
                You can review this client details in your admin dashboard.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background-color: #f1f5f9; padding: 18px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
              &copy; ${new Date().getFullYear()} CopixPro Admin System
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

      // 3. Dispatch emails to admins
      let sentCount = 0;
      for (const email of adminEmails) {
        try {
          await strapi
            .plugin("email")
            .service("email")
            .send({
              to: email,
              from: fromEmail,
              subject: subject,
              html: emailHtml,
            });
          sentCount++;
        } catch (sendErr) {
          strapi.log.error(
            `[AdminNotificationService] Error sending email to admin ${email}:`,
            sendErr
          );
        }
      }

      strapi.log.info(
        `[AdminNotificationService] Notified ${sentCount}/${adminEmails.length} admin user(s) about Machine ID ${data.action} for ${clientName}.`
      );

      return { sent: sentCount, totalAdmins: adminEmails.length };
    } catch (error: any) {
      strapi.log.error(
        "[AdminNotificationService] Error notifying admins on Machine ID change:",
        error
      );
      return { sent: 0, totalAdmins: 0 };
    }
  }
}

export const adminNotificationService = new AdminNotificationService();
export default adminNotificationService;
