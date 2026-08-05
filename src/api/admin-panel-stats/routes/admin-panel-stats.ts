export default {
  routes: [
    {
      method: "GET",
      path: "/dashboard/stats",
      handler: "admin-panel-stats.getStats",
      config: {
        auth: {},
      },
    },
    {
      method: "GET",
      path: "/clients",
      handler: "admin-panel-stats.getClients",
      config: {
        auth: {},
      },
    },
    {
      method: "GET",
      path: "/dashboard/client-status-analysis",
      handler: "admin-panel-stats.getClientStatusAnalysis",
      config: {
        auth: {},
      },
    },
    {
      method: "GET",
      path: "/dashboard/weekly-client-registration",
      handler: "admin-panel-stats.getWeeklyClientRegistration",
      config: {
        auth: {},
      },
    },
  ],
};