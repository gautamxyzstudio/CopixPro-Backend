export default {
  routes: [
    {
      method: "POST",
      path: "/wise/verify",
      handler: "payment-log.verifyWisePayment",
      config: {
        auth: false,
      },
    },
    {
      method: "GET",
      path: "/wise/verify",
      handler: "payment-log.verifyWisePayment",
      config: {
        auth: false,
      },
    },
    {
      method: "GET",
      path: "/wise/profiles",
      handler: "payment-log.getWiseProfiles",
      config: {
        auth: false,
      },
    },
    {
      method: "GET",
      path: "/wise/statement",
      handler: "payment-log.getWiseStatement",
      config: {
        auth: false,
      },
    },
    {
      method: "POST",
      path: "/wise/webhook",
      handler: "payment-log.wiseWebhook",
      config: {
        auth: false,
      },
    },
  ],
};
