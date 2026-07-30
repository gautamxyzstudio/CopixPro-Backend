export default {

  routes: [

    {
      method: "POST",
      path: "/orders/create",
      handler: "order.create",
      config: {
        auth: false
      }
    },

    {
      method: "GET",
      path: "/orders/status/:orderNumber",
      handler: "order.paymentStatus",
      config: {
        auth: false
      }
    }

  ]

};