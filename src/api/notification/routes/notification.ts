export default {
  routes: [
    {
      method: "GET",
      path: "/notifications",
      handler: "notification.find",
      config: {
        auth: {},
      },
    },
    {
      method: "PUT",
      path: "/notifications/read-all",
      handler: "notification.markAllAsRead",
      config: {
        auth: {},
      },
    },
    {
      method: "PUT",
      path: "/notifications/:id/read",
      handler: "notification.markAsRead",
      config: {
        auth: {},
      },
    },
  ],
};
