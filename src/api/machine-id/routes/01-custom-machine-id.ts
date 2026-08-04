export default {
  routes: [
    {
      method: "GET",
      path: "/machine-ids/me",
      handler: "machine-id.getMyMachineId",
      config: {
        auth: {},
      },
    },
  ],
};
