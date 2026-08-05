/**
 * machine-id controller
 */

import { factories } from "@strapi/strapi";
import adminNotificationService from "../../../services/adminNotificationService";
import notificationService from "../../../services/notificationService";

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

/**
 * Resolve user from ctx.state.user or Authorization Bearer token header
 */
async function resolveUserFromCtx(strapi: any, ctx: any): Promise<any> {
  let user = ctx.state.user;
  const authHeader =
    ctx.headers.authorization || ctx.request.headers.authorization;

  if (!user && authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.split(" ")[1];
      const decoded: any = await strapi
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
      strapi.log.warn("Invalid JWT token provided in Machine ID controller");
    }
  }

  return user;
}

/**
 * Helper to check if a user has a valid wiseTransactionId
 * from their Orders or Payment Logs.
 */
async function getUserWiseTransactionId(
  strapi: any,
  targetUser: any,
  providedWiseTxId?: string,
): Promise<string | null> {
  const cleanProvidedTxId = providedWiseTxId
    ? String(providedWiseTxId).trim()
    : "";

  const userFilters: any[] = [];
  if (targetUser.id) {
    userFilters.push({ users_permissions_user: { id: targetUser.id } });
  }
  if (targetUser.documentId) {
    userFilters.push({
      users_permissions_user: { documentId: targetUser.documentId },
    });
  }
  if (targetUser.email) {
    userFilters.push({
      customerEmail: { $eqi: String(targetUser.email).toLowerCase().trim() },
    });
  }

  if (userFilters.length === 0) return null;

  // 1. Check Orders for wiseTransactionId linked to user
  const orderWhere: any = {
    $or: userFilters,
    wiseTransactionId: { $notNull: true },
  };

  if (cleanProvidedTxId) {
    orderWhere.wiseTransactionId = cleanProvidedTxId;
  }

  const matchingOrders: any[] = await strapi
    .documents("api::order.order")
    .findMany({
      filters: orderWhere,
    });

  if (matchingOrders && matchingOrders.length > 0) {
    const validOrder = matchingOrders.find(
      (o: any) =>
        o.wiseTransactionId && String(o.wiseTransactionId).trim().length > 0,
    );
    if (validOrder) {
      return String(validOrder.wiseTransactionId).trim();
    }
  }

  // 2. Check Payment Logs for paid wiseTransferId or transactionId
  const logUserFilters: any[] = [];
  if (targetUser.id) {
    logUserFilters.push({ users_permissions_user: { id: targetUser.id } });
  }
  if (targetUser.documentId) {
    logUserFilters.push({
      users_permissions_user: { documentId: targetUser.documentId },
    });
  }

  if (logUserFilters.length > 0) {
    const logWhere: any = {
      $or: logUserFilters,
      payment_status: "paid",
    };

    if (cleanProvidedTxId) {
      logWhere.$and = [
        {
          $or: [
            { wiseTransferId: cleanProvidedTxId },
            { transactionId: cleanProvidedTxId },
          ],
        },
      ];
    }

    const matchingLogs: any[] = await strapi
      .documents("api::payment-log.payment-log")
      .findMany({
        filters: logWhere,
      });

    if (matchingLogs && matchingLogs.length > 0) {
      const validLog = matchingLogs.find(
        (l: any) =>
          (l.wiseTransferId && String(l.wiseTransferId).trim().length > 0) ||
          (l.transactionId && String(l.transactionId).trim().length > 0),
      );
      if (validLog) {
        return String(validLog.wiseTransferId || validLog.transactionId).trim();
      }
    }
  }

  // 3. Fallback: If providedWiseTxId was passed directly in body, check global Order/PaymentLog match
  if (cleanProvidedTxId) {
    const globalOrder: any = await strapi
      .documents("api::order.order")
      .findFirst({
        filters: { wiseTransactionId: cleanProvidedTxId },
      });
    if (globalOrder && globalOrder.wiseTransactionId) {
      return String(globalOrder.wiseTransactionId).trim();
    }

    const globalLog: any = await strapi
      .documents("api::payment-log.payment-log")
      .findFirst({
        filters: {
          $or: [
            { wiseTransferId: cleanProvidedTxId },
            { transactionId: cleanProvidedTxId },
          ],
          payment_status: "paid",
        },
      });
    if (globalLog) {
      return String(
        globalLog.wiseTransferId ||
          globalLog.transactionId ||
          cleanProvidedTxId,
      ).trim();
    }
  }

  return null;
}

export default factories.createCoreController(
  "api::machine-id.machine-id",
  ({ strapi }) => ({
    /**
     * Get machine IDs for ONLY the logged in user (by token)
     * GET /api/machine-ids
     */
    async find(ctx) {
      try {
        const user = await resolveUserFromCtx(strapi, ctx);

        if (!user) {
          return ctx.unauthorized(
            "Authentication required to view machine IDs",
          );
        }

        const userFilters: any[] = [];
        if (user.id) {
          userFilters.push({ users_permissions_user: { id: user.id } });
        }
        if (user.documentId) {
          userFilters.push({
            users_permissions_user: { documentId: user.documentId },
          });
        }

        const machineIds = await strapi
          .documents("api::machine-id.machine-id")
          .findMany({
            filters: { $or: userFilters },
            populate: ["users_permissions_user"],
            sort: ["createdAt:desc"],
          });

        return ctx.send(machineIds);
      } catch (error: any) {
        strapi.log.error("Find Machine IDs Error:", error);
        return ctx.internalServerError(
          error?.message || "Failed to fetch machine IDs",
        );
      }
    },

    /**
     * Get a specific machine ID by ID for the logged in user
     * GET /api/machine-ids/:id
     */
    async findOne(ctx) {
      try {
        const { id } = ctx.params;
        const user = await resolveUserFromCtx(strapi, ctx);

        if (!user) {
          return ctx.unauthorized("Authentication required");
        }

        const record: any = await strapi
          .documents("api::machine-id.machine-id")
          .findFirst({
            filters: getIdOrDocumentIdFilter(id),
            populate: ["users_permissions_user"],
          });

        if (!record) {
          return ctx.notFound("Machine ID record not found");
        }

        const recordUser = record.users_permissions_user;
        const isOwner =
          recordUser &&
          (recordUser.id === user.id ||
            recordUser.documentId === user.documentId ||
            recordUser.email === user.email);

        if (!isOwner) {
          return ctx.forbidden(
            "You do not have permission to view this machine ID",
          );
        }

        return ctx.send(record);
      } catch (error: any) {
        strapi.log.error("Find One Machine ID Error:", error);
        return ctx.internalServerError(
          error?.message || "Failed to fetch machine ID",
        );
      }
    },

    /**
     * Dedicated endpoint for the currently logged-in user's machine IDs
     * GET /api/machine-ids/me
     */
    async getMyMachineId(ctx) {
      try {
        const user = await resolveUserFromCtx(strapi, ctx);

        if (!user) {
          return ctx.unauthorized(
            "Authentication required to view your machine ID",
          );
        }

        const userFilters: any[] = [];
        if (user.id) {
          userFilters.push({ users_permissions_user: { id: user.id } });
        }
        if (user.documentId) {
          userFilters.push({
            users_permissions_user: { documentId: user.documentId },
          });
        }

        const machineIds = await strapi
          .documents("api::machine-id.machine-id")
          .findMany({
            filters: { $or: userFilters },
            populate: ["users_permissions_user"],
            sort: ["createdAt:desc"],
          });

        return ctx.send(machineIds);
      } catch (error: any) {
        strapi.log.error("Get My Machine ID Error:", error);
        return ctx.internalServerError(
          error?.message || "Failed to fetch your machine ID",
        );
      }
    },

    async create(ctx) {
      try {
        const body = ctx.request.body?.data || ctx.request.body || {};
        const machineIdInput = body.machineId || body.machine_id;
        const providedWiseTxId =
          body.wiseTransactionId || body.transactionId || body.wiseTransferId;

        if (!machineIdInput) {
          return ctx.badRequest("machineId is required");
        }

        const newMachineId = String(machineIdInput).trim();

        // 1. Resolve User (from auth state, JWT token header, or payload)
        let targetUser: any = await resolveUserFromCtx(strapi, ctx);

        const providedUser =
          body.users_permissions_user || body.user || body.userId;
        if (!targetUser && providedUser) {
          if (
            typeof providedUser === "object" &&
            (providedUser.id || providedUser.documentId)
          ) {
            targetUser = providedUser;
          } else {
            targetUser = await strapi
              .documents("plugin::users-permissions.user")
              .findFirst({
                filters: getIdOrDocumentIdFilter(providedUser),
              });
          }
        }

        if (!targetUser) {
          return ctx.unauthorized(
            "Authentication or user reference is required",
          );
        }

        // 2. Validate user has a wiseTransactionId
        const wiseTransactionId = await getUserWiseTransactionId(
          strapi,
          targetUser,
          providedWiseTxId,
        );

        if (!wiseTransactionId) {
          return ctx.forbidden(
            "Machine ID can only be created for users who have a valid wiseTransactionId (paid purchase).",
          );
        }

        // 3. Check if a machine-id record already exists for this user
        const userFilters: any[] = [];
        if (targetUser.id) {
          userFilters.push({ users_permissions_user: { id: targetUser.id } });
        }
        if (targetUser.documentId) {
          userFilters.push({
            users_permissions_user: { documentId: targetUser.documentId },
          });
        }

        let existingRecord: any = null;
        if (userFilters.length > 0) {
          existingRecord = await strapi
            .documents("api::machine-id.machine-id")
            .findFirst({
              filters: { $or: userFilters },
              populate: ["users_permissions_user"],
            });
        }

        // 4. First time create for this user
        if (!existingRecord) {
          const newRecord = await strapi
            .documents("api::machine-id.machine-id")
            .create({
              data: {
                machineId: newMachineId,
                users_permissions_user: targetUser.documentId || targetUser.id,
                previous_machine_id: [],
                wiseTransactionId: wiseTransactionId,
                publishedAt: new Date().toISOString(),
              } as any,
              populate: ["users_permissions_user"],
              status: "published",
            });

          adminNotificationService
            .notifyAdminsOnMachineIdChange(strapi, {
              action: "created",
              clientUser: targetUser,
              newMachineId,
              previousMachineId: [],
              wiseTransactionId,
              updatedAt: newRecord.createdAt || new Date(),
            })
            .catch((err) =>
              strapi.log.error(
                "Failed sending admin notification for Machine ID creation:",
                err
              )
            );

          notificationService
            .notifyMachineIdChanged(strapi, {
              action: "created",
              user: targetUser,
              newMachineId,
              previousMachineId: [],
              wiseTransactionId,
            })
            .catch((err) =>
              strapi.log.error(
                "Failed creating notification record for Machine ID creation:",
                err
              )
            );

          return ctx.send({
            success: true,
            message: "Machine ID created successfully",
            data: newRecord,
          });
        }

        // 5. Subsequent update for same user -> append old machine ID and its creation/replacement datetime
        let prevList: any[] = [];
        if (Array.isArray(existingRecord.previous_machine_id)) {
          prevList = [...existingRecord.previous_machine_id];
        } else if (
          typeof existingRecord.previous_machine_id === "string" &&
          existingRecord.previous_machine_id.trim()
        ) {
          try {
            const parsed = JSON.parse(existingRecord.previous_machine_id);
            prevList = Array.isArray(parsed)
              ? parsed
              : [existingRecord.previous_machine_id];
          } catch {
            prevList = [existingRecord.previous_machine_id];
          }
        }

        const oldMachineId = existingRecord.machineId;
        const oldDateTime =
          existingRecord.updatedAt ||
          existingRecord.createdAt ||
          new Date().toISOString();

        if (oldMachineId && String(oldMachineId).trim() !== newMachineId) {
          const cleanOldId = String(oldMachineId).trim();

          const alreadyExists = prevList.some((item: any) => {
            if (typeof item === "string") return item.trim() === cleanOldId;
            if (item && typeof item === "object")
              return item.machineId === cleanOldId;
            return false;
          });

          if (!alreadyExists) {
            prevList.push({
              machineId: cleanOldId,
              dateTime: oldDateTime,
              replacedAt: new Date().toISOString(),
            });
          }
        }

        const docId = existingRecord.documentId || existingRecord.id;
        const updatedRecord = await strapi
          .documents("api::machine-id.machine-id")
          .update({
            documentId: docId as any,
            data: {
              machineId: newMachineId,
              previous_machine_id: prevList,
              wiseTransactionId: wiseTransactionId,
              users_permissions_user: targetUser.documentId || targetUser.id,
            } as any,
            populate: ["users_permissions_user"],
            status: "published",
          });

        adminNotificationService
          .notifyAdminsOnMachineIdChange(strapi, {
            action: "updated",
            clientUser: targetUser,
            newMachineId,
            previousMachineId: prevList,
            wiseTransactionId,
            updatedAt: updatedRecord.updatedAt || new Date(),
          })
          .catch((err) =>
            strapi.log.error(
              "Failed sending admin notification for Machine ID update:",
              err
            )
          );

        notificationService
          .notifyMachineIdChanged(strapi, {
            action: "updated",
            user: targetUser,
            newMachineId,
            previousMachineId: prevList,
            wiseTransactionId,
          })
          .catch((err) =>
            strapi.log.error(
              "Failed creating notification record for Machine ID update:",
              err
            )
          );

        return ctx.send({
          success: true,
          message: "Machine ID updated successfully",
          data: updatedRecord,
        });
      } catch (error: any) {
        strapi.log.error("Create Machine ID Error:", error);
        return ctx.internalServerError(
          error?.message || "Failed to process machine ID",
        );
      }
    },

    async update(ctx) {
      try {
        const { id } = ctx.params;
        const body = ctx.request.body?.data || ctx.request.body || {};
        const machineIdInput = body.machineId || body.machine_id;
        const providedWiseTxId =
          body.wiseTransactionId || body.transactionId || body.wiseTransferId;

        const existingRecord: any = await strapi
          .documents("api::machine-id.machine-id")
          .findFirst({
            filters: getIdOrDocumentIdFilter(id),
            populate: ["users_permissions_user"],
          });

        if (!existingRecord) {
          return ctx.notFound("Machine ID record not found");
        }

        const user =
          existingRecord.users_permissions_user ||
          (await resolveUserFromCtx(strapi, ctx));
        let wiseTx = existingRecord.wiseTransactionId;

        if (user) {
          const verifiedTx = await getUserWiseTransactionId(
            strapi,
            user,
            providedWiseTxId || existingRecord.wiseTransactionId,
          );

          if (!verifiedTx) {
            return ctx.forbidden(
              "Machine ID can only be updated for users who have a valid wiseTransactionId (paid purchase).",
            );
          }
          wiseTx = verifiedTx;
        }

        let prevList: any[] = [];
        if (Array.isArray(existingRecord.previous_machine_id)) {
          prevList = [...existingRecord.previous_machine_id];
        } else if (
          typeof existingRecord.previous_machine_id === "string" &&
          existingRecord.previous_machine_id.trim()
        ) {
          try {
            const parsed = JSON.parse(existingRecord.previous_machine_id);
            prevList = Array.isArray(parsed)
              ? parsed
              : [existingRecord.previous_machine_id];
          } catch {
            prevList = [existingRecord.previous_machine_id];
          }
        }

        const oldMachineId = existingRecord.machineId;
        const oldDateTime =
          existingRecord.updatedAt ||
          existingRecord.createdAt ||
          new Date().toISOString();
        const newMachineId = machineIdInput
          ? String(machineIdInput).trim()
          : oldMachineId;

        if (machineIdInput && oldMachineId && oldMachineId !== newMachineId) {
          const cleanOldId = String(oldMachineId).trim();

          const alreadyExists = prevList.some((item: any) => {
            if (typeof item === "string") return item.trim() === cleanOldId;
            if (item && typeof item === "object")
              return item.machineId === cleanOldId;
            return false;
          });

          if (!alreadyExists) {
            prevList.push({
              machineId: cleanOldId,
              dateTime: oldDateTime,
              createdAt: existingRecord.createdAt || oldDateTime,
              replacedAt: new Date().toISOString(),
            });
          }
        }

        const docId = existingRecord.documentId || existingRecord.id;
        const updatedRecord = await strapi
          .documents("api::machine-id.machine-id")
          .update({
            documentId: docId as any,
            data: {
              ...body,
              machineId: newMachineId,
              previous_machine_id: prevList,
              wiseTransactionId: wiseTx,
            } as any,
            populate: ["users_permissions_user"],
            status: "published",
          });

        adminNotificationService
          .notifyAdminsOnMachineIdChange(strapi, {
            action: "updated",
            clientUser: user || existingRecord.users_permissions_user || {},
            newMachineId: newMachineId,
            previousMachineId: prevList,
            wiseTransactionId: wiseTx,
            updatedAt: updatedRecord.updatedAt || new Date(),
          })
          .catch((err) =>
            strapi.log.error(
              "Failed sending admin notification for Machine ID update:",
              err
            )
          );

        notificationService
          .notifyMachineIdChanged(strapi, {
            action: "updated",
            user: user || existingRecord.users_permissions_user || {},
            newMachineId: newMachineId,
            previousMachineId: prevList,
            wiseTransactionId: wiseTx,
          })
          .catch((err) =>
            strapi.log.error(
              "Failed creating notification record for Machine ID update:",
              err
            )
          );

        return ctx.send({
          success: true,
          message: "Machine ID updated successfully",
          data: updatedRecord,
        });
      } catch (error: any) {
        strapi.log.error("Update Machine ID Error:", error);
        return ctx.internalServerError(
          error?.message || "Failed to update machine ID",
        );
      }
    },
  }),
);
