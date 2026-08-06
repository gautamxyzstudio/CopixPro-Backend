export default {
  routes: [
    {
      method: "POST",
      path: "/orders/create",
      handler: "order.create",
      config: {
        auth: {},
      },
    },

    {
      method: "GET",
      path: "/orders/me",
      handler: "order.getMyOrders",
      config: {
        auth: {},
      },
    },

    {
      method: "GET",
      path: "/orders/status/:orderNumber",
      handler: "order.paymentStatus",
      config: {
        auth: {},
      },
    },
  ],
};
