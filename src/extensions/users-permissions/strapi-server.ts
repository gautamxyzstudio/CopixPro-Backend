export default (plugin: any) => {
  /**
   * Override the GET /api/users/me endpoint response
   * to populate custom fields (firstName, lastName, phoneNumber, isActive)
   * as well as relations (role, machine_ids, orders, payment_logs).
   */
  const originalMe = plugin.controllers.user.me;

  plugin.controllers.user.me = async (ctx: any) => {
    const authUser = ctx.state.user;

    if (!authUser) {
      return ctx.unauthorized("Authentication required");
    }

    try {
      const userFilter: any = {};
      if (authUser.documentId) {
        userFilter.documentId = authUser.documentId;
      } else if (authUser.id) {
        userFilter.id = authUser.id;
      }

      let fullUser: any = null;

      if (Object.keys(userFilter).length > 0) {
        fullUser = await strapi
          .documents("plugin::users-permissions.user")
          .findFirst({
            filters: userFilter,
            populate: ["role"],
          });
      }

      if (!fullUser && authUser.id) {
        fullUser = await strapi.db
          .query("plugin::users-permissions.user")
          .findOne({
            where: { id: authUser.id },
            populate: ["role"],
          });
      }

      if (!fullUser) {
        // Fallback to default Strapi controller implementation if lookup fails
        return originalMe(ctx);
      }

      // Sanitize sensitive fields
      delete fullUser.password;
      delete fullUser.resetPasswordToken;
      delete fullUser.confirmationToken;

      return ctx.send(fullUser);
    } catch (error: any) {
      strapi.log.error("Error in overridden /users/me controller:", error);
      return originalMe(ctx);
    }
  };

  return plugin;
};
