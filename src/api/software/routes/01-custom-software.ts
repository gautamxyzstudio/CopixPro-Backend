export default {
  routes: [
    {
      method: "PUT",
      path: "/softwares/update-files",
      handler: "software.updateFiles",
      config: {
        auth: {},
      },
    },
    {
      method: "POST",
      path: "/softwares/update-files",
      handler: "software.updateFiles",
      config: {
        auth: {},
      },
    },
    {
      method: "PUT",
      path: "/softwares/:id/update-files",
      handler: "software.updateFiles",
      config: {
        auth: {},
      },
    },
    {
      method: "POST",
      path: "/softwares/:id/update-files",
      handler: "software.updateFiles",
      config: {
        auth: {},
      },
    },
  ],
};
