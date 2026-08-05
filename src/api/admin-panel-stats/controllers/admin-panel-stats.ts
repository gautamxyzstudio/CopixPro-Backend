import orderExpirationService from "../../../services/orderExpirationService";

export default {
  async getStats(ctx: any) {
    try {
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
            user = await strapi.db
              .query("plugin::users-permissions.user")
              .findOne({
                where: { id: decoded.id },
                populate: ["role"],
              });
          }
        } catch (err) {
          strapi.log.warn("Invalid JWT token in getStats");
        }
      }

      if (!user) {
        return ctx.unauthorized("Authentication required");
      }

      // Count only active users with Client role
      const totalUsers = await strapi.db
        .query("plugin::users-permissions.user")
        .count({
          where: {
            role: {
              name: "Client",
            },
            isActive: true,
          },
        });

      // Count total active machine IDs for active Client users
      const totalActiveMachineIds = await strapi.db
        .query("api::machine-id.machine-id")
        .count({
          where: {
            users_permissions_user: {
              role: {
                name: "Client",
              },
              isActive: true,
            },
          },
        });

      // Total revenue = totalActiveMachineIds * 249
      const totalRevenue = totalActiveMachineIds * 249;

      return ctx.send({
        totalUsers,
        totalActiveMachineIds,
        totalRevenue,
      });
    } catch (error) {
      strapi.log.error("Dashboard Stats Error:", error);
      return ctx.internalServerError("Failed to fetch dashboard statistics");
    }
  },

  async getClients(ctx: any) {
    try {
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
            user = await strapi.db
              .query("plugin::users-permissions.user")
              .findOne({
                where: { id: decoded.id },
                populate: ["role"],
              });
          }
        } catch (err) {
          strapi.log.warn("Invalid JWT token in getClients");
        }
      }

      if (!user) {
        return ctx.unauthorized("Authentication required");
      }

      await orderExpirationService.expireUnpaidOrders(strapi);

      const clients = await strapi.db
        .query("plugin::users-permissions.user")
        .findMany({
          where: {
            role: {
              name: "Client",
            },
          },
          populate: {
            role: {
              select: ["name"],
            },
            machine_ids: {
              select: [
                "id",
                "documentId",
                "machineId",
                "previous_machine_id",
                "updatedAt",
                "createdAt",
              ],
            },
            orders: {
              select: [
                "orderNumber",
                "paymentStatus",
                "amount",
                "currency",
                "paidAt",
                "createdAt",
              ],
              orderBy: { createdAt: "desc" },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });

      const formattedClients = clients.map((client: any) => {
        const firstName = client.firstName
          ? String(client.firstName).trim()
          : "";
        const lastName = client.lastName ? String(client.lastName).trim() : "";
        const fullName =
          [firstName, lastName].filter(Boolean).join(" ") ||
          client.username ||
          client.email;

        const formattedMachineIds = (client.machine_ids || []).map((m: any) => {
          let previousIds: any[] = [];

          if (Array.isArray(m.previous_machine_id)) {
            previousIds = m.previous_machine_id;
          } else if (
            typeof m.previous_machine_id === "string" &&
            m.previous_machine_id.trim()
          ) {
            try {
              const parsed = JSON.parse(m.previous_machine_id);
              previousIds = Array.isArray(parsed)
                ? parsed
                : [m.previous_machine_id];
            } catch {
              previousIds = [m.previous_machine_id];
            }
          }

          const parsedPreviousIds = previousIds.map((item: any) => {
            if (typeof item === "string") {
              return {
                machineId: item,
                dateTime: null,
                replacedAt: null,
              };
            }
            return {
              machineId: item?.machineId || null,
              dateTime: item?.dateTime || null,
              replacedAt: item?.replacedAt || null,
            };
          });

          return {
            id: m.id,
            documentId: m.documentId,
            machineId: m.machineId,
            updatedAt: m.updatedAt,
            createdAt: m.createdAt,
            previousIds: parsedPreviousIds,
          };
        });

        const orders = (client.orders || []).map((order: any) => ({
          orderNumber: order.orderNumber,
          paymentStatus: order.paymentStatus,
          amount: order.amount,
          currency: order.currency,
          paidAt: order.paidAt,
          createdAt: order.createdAt,
        }));

        const latestOrderStatus =
          orders.length > 0 ? orders[0].paymentStatus : "N/A";

        return {
          id: client.id,
          documentId: client.documentId,
          username: client.username,
          email: client.email,
          firstName: client.firstName || "",
          lastName: client.lastName || "",
          fullName,
          phoneNumber: client.phoneNumber || "",
          isActive: Boolean(client.isActive),
          confirmed: Boolean(client.confirmed),
          createdAt: client.createdAt,
          updatedAt: client.updatedAt,
          role: client.role?.name || "Client",
          orderStatus: latestOrderStatus,
          orders,
          machine_ids: formattedMachineIds,
        };
      });

      return ctx.send({
        success: true,
        message: "Clients fetched successfully",
        count: formattedClients.length,
        data: formattedClients,
      });
    } catch (error) {
      strapi.log.error("Get clients error:", error);
      return ctx.internalServerError("Failed to fetch clients");
    }
  },

  /**
   * GET /api/dashboard/client-status-analysis
   * Graph Analysis 1:
   * Active users (client user has an order with paymentStatus 'paid')
   * vs Inactive users (no order OR no order with paymentStatus 'paid')
   */
  async getClientStatusAnalysis(ctx: any) {
    try {
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
            user = await strapi.db
              .query("plugin::users-permissions.user")
              .findOne({
                where: { id: decoded.id },
                populate: ["role"],
              });
          }
        } catch (err) {
          strapi.log.warn("Invalid JWT token in getClientStatusAnalysis");
        }
      }

      if (!user) {
        return ctx.unauthorized("Authentication required");
      }

      await orderExpirationService.expireUnpaidOrders(strapi);

      const clients = await strapi.db
        .query("plugin::users-permissions.user")
        .findMany({
          where: {
            isActive: true,
            role: {
              name: "Client",
            },
          },
          populate: {
            orders: {
              select: ["paymentStatus"],
            },
          },
        });

      let activeUsers = 0;
      let inactiveUsers = 0;

      for (const client of clients) {
        const hasPaidOrder =
          Array.isArray(client.orders) &&
          client.orders.some(
            (o: any) => String(o.paymentStatus).toLowerCase() === "paid",
          );

        if (hasPaidOrder) {
          activeUsers++;
        } else {
          inactiveUsers++;
        }
      }

      const totalUsers = clients.length;
      const activePercentage =
        totalUsers > 0
          ? Number(((activeUsers / totalUsers) * 100).toFixed(1))
          : 0;
      const inactivePercentage =
        totalUsers > 0
          ? Number(((inactiveUsers / totalUsers) * 100).toFixed(1))
          : 0;

      return ctx.send({
        activeUsers,
        inactiveUsers,
        totalUsers,
        activePercentage,
        inactivePercentage,
      });
    } catch (error) {
      strapi.log.error("Client Status Analysis Error:", error);
      return ctx.internalServerError("Failed to fetch client status analysis");
    }
  },

  /**
   * GET /api/dashboard/weekly-client-registration
   * Graph Analysis 2:
   * Day-by-day analysis for the past 1 week (7 days) showing new client users added with isActive = true
   */
  async getWeeklyClientRegistration(ctx: any) {
    try {
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
            user = await strapi.db
              .query("plugin::users-permissions.user")
              .findOne({
                where: { id: decoded.id },
                populate: ["role"],
              });
          }
        } catch (err) {
          strapi.log.warn("Invalid JWT token in getWeeklyClientRegistration");
        }
      }

      if (!user) {
        return ctx.unauthorized("Authentication required");
      }

      // Build 7 daily buckets ending today
      const daysList: Array<{ date: string; day: string; count: number }> = [];
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(now.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);

      for (let i = 0; i < 7; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);

        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const dayNum = String(d.getDate()).padStart(2, "0");
        const dateStr = `${year}-${month}-${dayNum}`;
        const dayName = dayNames[d.getDay()];

        daysList.push({
          date: dateStr,
          day: dayName,
          count: 0,
        });
      }

      // Fetch active Client users created since startDate
      const activeClients = await strapi.db
        .query("plugin::users-permissions.user")
        .findMany({
          where: {
            role: {
              name: "Client",
            },
            isActive: true,
            createdAt: {
              $gte: startDate.toISOString(),
            },
          },
          select: ["id", "createdAt"],
        });

      let totalNewActiveClients = 0;

      for (const client of activeClients) {
        if (!client.createdAt) continue;
        const created = new Date(client.createdAt);
        const cYear = created.getFullYear();
        const cMonth = String(created.getMonth() + 1).padStart(2, "0");
        const cDay = String(created.getDate()).padStart(2, "0");
        const clientDateStr = `${cYear}-${cMonth}-${cDay}`;

        const bucket = daysList.find((b) => b.date === clientDateStr);
        if (bucket) {
          bucket.count++;
          totalNewActiveClients++;
        }
      }

      return ctx.send(daysList);
    } catch (error) {
      strapi.log.error("Weekly Client Registration Error:", error);
      return ctx.internalServerError(
        "Failed to fetch weekly client registration",
      );
    }
  },
};
