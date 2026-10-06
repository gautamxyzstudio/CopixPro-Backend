import type { Core } from "@strapi/strapi";

const config = ({
  env,
}: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  upload: {
    config: {
      provider: "cloudinary",
      providerOptions: {
        cloud_name: env("CLOUDINARY_NAME"),
        api_key: env("CLOUDINARY_KEY"),
        api_secret: env("CLOUDINARY_SECRET"),
      },
      actionOptions: {
        upload: {
          folder: env("CLOUDINARY_FOLDER", "copixpro"),
          use_filename: true,
          unique_filename: true,
          overwrite: false,
          // Automatic compression & modern format delivery
          transformation: [
            { quality: "auto:good" }, // Smart compression without perceptible quality loss
            { fetch_format: "auto" }, // Automatically serve WebP/AVIF when supported
          ],
        },
        uploadStream: {
          folder: env("CLOUDINARY_FOLDER", "copixpro"),
          use_filename: true,
          unique_filename: true,
          overwrite: false,
          // Automatic compression & modern format delivery
          transformation: [
            { quality: "auto:good" },
            { fetch_format: "auto" },
          ],
        },
        delete: {},
      },
      // Empty breakpoints: Only store original image and admin thumbnail (no small, medium, large, xlarge)
      breakpoints: {},
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
