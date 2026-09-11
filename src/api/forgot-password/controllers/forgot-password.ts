
import crypto from "crypto";
import { handleControllerError } from "../../../utils/errorHandler";

export default {
    async forgotPassword(ctx: any) {
        try {
            const { email } = ctx.request.body;

            if (!email) {
                return ctx.badRequest("Email is required");
            }

            const user = await strapi.db
                .query("plugin::users-permissions.user")
                .findOne({
                    where: {
                        email: email.toLowerCase(),
                    },
                });

            if (!user) {
                return ctx.badRequest("User not found");
            }

            if (user.resetPasswordToken) {
                try {
                    const tokenData = JSON.parse(
                        Buffer.from(
                            user.resetPasswordToken,
                            "base64"
                        ).toString()
                    );

                    if (
                        tokenData.expiresAt &&
                        Date.now() < tokenData.expiresAt
                    ) {
                        const remainingSeconds = Math.ceil(
                            (tokenData.expiresAt - Date.now()) / 1000
                        );

                        return ctx.badRequest({
                            success: false,
                            message: `OTP already sent. Please wait ${remainingSeconds} seconds before requesting a new OTP.`,
                            retryAfter: remainingSeconds,
                        });
                    }
                } catch (err) {
                    console.error(err);
                }
            }

            const otp = Math.floor(
                100000 + Math.random() * 900000
            ).toString();

            const token = Buffer.from(
                JSON.stringify({
                    otp,
                    expiresAt: Date.now() + 5 * 60 * 1000,
                })
            ).toString("base64");

            await strapi.db
                .query("plugin::users-permissions.user")
                .update({
                    where: { id: user.id },
                    data: {
                        resetPasswordToken: token,
                    },
                });

            await strapi.plugins.email.services.email.send({
                to: user.email,
                from: process.env.BREVO_FROM_EMAIL,
                subject: "CopiXPro Password Reset OTP",
                html: `
        <h2>Password Reset</h2>
        <p>Hello ${user.firstName || "User"},</p>
        <p>Your OTP is:</p>
        <h1>${otp}</h1>
        <p>This OTP expires in 5 minutes.</p>
      `,
            });

            return ctx.send({
                success: true,
                message: "OTP sent successfully",
            });
        } catch (error) {
            console.error(error);
            return handleControllerError(ctx, error, "Something went wrong");
        }
    },

    async verifyResetOtp(ctx: any) {
        try {
            const { email, otp } = ctx.request.body;

            if (!email || !otp) {
                return ctx.badRequest("Email and OTP are required");
            }

            const user = await strapi.db
                .query("plugin::users-permissions.user")
                .findOne({
                    where: {
                        email: email.toLowerCase(),
                    },
                });

            if (!user || !user.resetPasswordToken) {
                return ctx.badRequest("OTP not found");
            }

            const tokenData = JSON.parse(
                Buffer.from(
                    user.resetPasswordToken,
                    "base64"
                ).toString()
            );

            if (Date.now() > tokenData.expiresAt) {
                return ctx.badRequest(
                    "OTP expired. Please request a new OTP."
                );
            }

            if (tokenData.otp !== otp) {
                return ctx.badRequest("Invalid OTP");
            }

            const resetToken = crypto
                .randomBytes(32)
                .toString("hex");

            const verifiedToken = Buffer.from(
                JSON.stringify({
                    resetToken,
                    expiresAt: Date.now() + 5 * 60 * 1000,
                })
            ).toString("base64");

            await strapi.db
                .query("plugin::users-permissions.user")
                .update({
                    where: { id: user.id },
                    data: {
                        resetPasswordToken: verifiedToken,
                    },
                });

            return ctx.send({
                success: true,
                message: "OTP verified successfully",
                resetToken,
            });
        } catch (error) {
            console.error(error);
            return handleControllerError(ctx, error, "Verification failed");
        }
    },

    async resendOtp(ctx: any) {
        try {
            const { email } = ctx.request.body;

            if (!email) {
                return ctx.badRequest("Email is required");
            }

            const user = await strapi.db
                .query("plugin::users-permissions.user")
                .findOne({
                    where: {
                        email: email.toLowerCase(),
                    },
                });

            if (!user) {
                return ctx.badRequest("User not found");
            }

            // Prevent resend if OTP is still active
            if (user.resetPasswordToken) {
                try {
                    const tokenData = JSON.parse(
                        Buffer.from(
                            user.resetPasswordToken,
                            "base64"
                        ).toString()
                    );

                    if (
                        tokenData.otp &&
                        tokenData.expiresAt &&
                        Date.now() < tokenData.expiresAt
                    ) {
                        const remainingSeconds = Math.ceil(
                            (tokenData.expiresAt - Date.now()) / 1000
                        );

                        ctx.status = 400;

                        return ctx.send({
                            success: false,
                            message: `OTP already sent. Please wait ${remainingSeconds} seconds before requesting a new OTP.`,
                            retryAfter: remainingSeconds,
                        });
                    }
                } catch (err) {
                    console.error(
                        "Invalid reset token format",
                        err
                    );
                }
            }

            const otp = Math.floor(
                100000 + Math.random() * 900000
            ).toString();

            const token = Buffer.from(
                JSON.stringify({
                    otp,
                    expiresAt: Date.now() + 5 * 60 * 1000,
                })
            ).toString("base64");

            await strapi.db
                .query("plugin::users-permissions.user")
                .update({
                    where: {
                        id: user.id,
                    },
                    data: {
                        resetPasswordToken: token,
                    },
                });

            await strapi.plugins.email.services.email.send({
                to: user.email,
                from: process.env.BREVO_FROM_EMAIL,
                subject: "CopiXPro Password Reset OTP",
                html: `
                <h2>Password Reset</h2>

                <p>Hello ${user.firstName || "User"},</p>

                <p>Your new OTP is:</p>

                <h1>${otp}</h1>

                <p>
                    This OTP expires in 5 minutes.
                </p>
            `,
            });

            return ctx.send({
                success: true,
                message: "OTP resent successfully",
            });
        } catch (error) {
            console.error(error);
            return handleControllerError(
                ctx,
                error,
                "Failed to resend OTP"
            );
        }
    },

    async resetPassword(ctx: any) {
        try {
            const { email, password, resetToken } =
                ctx.request.body;

            if (!email || !password || !resetToken) {
                return ctx.badRequest(
                    "Email, password and reset token are required"
                );
            }

            const user = await strapi.db
                .query("plugin::users-permissions.user")
                .findOne({
                    where: {
                        email: email.toLowerCase(),
                    },
                });

            if (!user || !user.resetPasswordToken) {
                return ctx.badRequest(
                    "Invalid reset request"
                );
            }

            const tokenData = JSON.parse(
                Buffer.from(
                    user.resetPasswordToken,
                    "base64"
                ).toString()
            );

            if (Date.now() > tokenData.expiresAt) {
                return ctx.badRequest(
                    "Reset token expired"
                );
            }

            if (
                tokenData.resetToken !== resetToken
            ) {
                return ctx.badRequest(
                    "Invalid reset token"
                );
            }

            await strapi
                .plugin("users-permissions")
                .service("user")
                .edit(user.id, {
                    password,
                    resetPasswordToken: null,
                });

            return ctx.send({
                success: true,
                message: "Password reset successfully",
            });
        } catch (error) {
            console.error(error);
            return handleControllerError(ctx, error, "Reset failed");
        }
    }

}