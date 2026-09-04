import type { Core } from "@strapi/strapi";

const config = ({
  env,
}: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  upload: {
    config: {
      provider: "local",
      providerOptions: {
        sizeLimit: 300 * 1024 * 1024, // 300MB maximum file size limit
        path: env("UPLOAD_PATH", "/data/uploads"),
      },
      actionOptions: {
        upload: {},
        uploadStream: {},
        delete: {},
      },
    },
  },
  email: {
    config: {
      provider: "strapi-provider-email-brevo",
      providerOptions: {
        apiKey: env("BREVO_API_KEY"),
      },
      settings: {
        defaultFrom: env("BREVO_FROM_EMAIL"),
        defaultReplyTo: env("BREVO_FROM_EMAIL"),
      },
    },
  },
});

export default config;
