import crypto from "crypto";
import notificationService from "../../../services/notificationService";
import { handleControllerError } from "../../../utils/errorHandler";

export default {
    async register(ctx: any) {
        try {
            const { firstName, lastName, email, phoneNumber, password } =
                ctx.request.body;

            if (!email || !firstName || !lastName || !password) {
                return ctx.badRequest(
                    "First name, last name and email are required"
                );
            }

            const normalizedEmail = email.toLowerCase();

            const existingUser = await strapi.db
                .query("plugin::users-permissions.user")
                .findOne({
                    where: {
                        email: normalizedEmail,
                    },
                });

            if (existingUser) {
                return ctx.badRequest("Email already exists");
            }

            const clientRole = await strapi.db
                .query("plugin::users-permissions.role")
                .findOne({
                    where: {
                        name: "Client",
                    },
                });

            if (!clientRole) {
                return ctx.badRequest("Client role not found");
            }

            const baseName = firstName
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "");

            let username = "";
            let exists = true;

            while (exists) {
                const randomNumber = Math.floor(
                    1000 + Math.random() * 9000
                );

                username = `${baseName}${randomNumber}`;

                const existingUsername = await strapi.db
                    .query("plugin::users-permissions.user")
                    .findOne({
                        where: { username },
                    });

                exists = !!existingUsername;
            }

            const confirmationToken = crypto
                .randomBytes(32)
                .toString("hex");

            const user = await strapi
                .plugin("users-permissions")
                .service("user")
                .add({
                    username,
                    email: normalizedEmail,
                    password,
                    firstName,
                    lastName,
                    phoneNumber,
                    provider: "local",
                    confirmed: false,
                    isActive:false,
                    blocked: false,
                    confirmationToken,
                    role: clientRole.id,
                });

            const confirmationLink =
                `${process.env.BACKEND_URL}/api/client/verify-email?token=${confirmationToken}`;

            try {
                // console.log("SENDING EMAIL TO:", normalizedEmail)

                const emailResult = await strapi.plugins.email.services.email.send({
                    to: normalizedEmail,
                    from: process.env.BREVO_FROM_EMAIL,
                    subject: "Verify Your CopiXPro Account",
                    html: ` <div style=" font-family:Arial,sans-serif; max-width:600px; margin:auto; background:#ffffff; border-radius:12px; padding:40px; box-shadow:0 2px 10px rgba(0,0,0,0.08); border:1px solid #eee; " > <div style="text-align:center;padding-bottom:20px"> <img src="" alt="CopiXPro" style=" max-width:220px; height:auto; " /> </div> <h2 style=" color:#222; text-align:center; margin-bottom:25px; font-size:28px; " > Welcome to CopiXPro 🚀 </h2> <p style=" font-size:16px; color:#444; line-height:1.8; " > Hi <strong>${firstName}</strong>, </p> <p style=" font-size:16px; color:#555; line-height:1.8; " > Thank you for registering with CopiXPro. </p> <p style=" font-size:16px; color:#555; line-height:1.8; " > Please verify your email address by clicking the button below. </p> <div style=" text-align:center; margin:35px 0; " > <a href="${confirmationLink}" style=" background:#ff6a00; color:#fff; padding:14px 32px; text-decoration:none; border-radius:8px; display:inline-block; font-weight:bold; font-size:15px; " > Verify Email </a> </div> <p style=" color:#666; line-height:1.8; font-size:14px; " > If you didn't create this account, simply ignore this email. </p> <hr style=" border:none; border-top:1px solid #e5e5e5; margin:25px 0; " /> <p style=" font-size:12px; color:#999; text-align:center; " > © ${new Date().getFullYear()} CopiXPro. All rights reserved. </p> </div> `,
                });

                // console.log("EMAIL RESULT:", emailResult);

                if (!emailResult) {
                    await strapi.db
                        .query("plugin::users-permissions.user")
                        .delete({
                            where: {
                                id: user.id,
                            },
                        });

                    return ctx.send({
                        success: false,
                        message: "Failed to send verification email",
                    });
                }

                return ctx.send({
                    success: true,
                    message:
                        "Account created successfully. Please verify your email.",
                });
            } catch (emailError: any) {
                console.error("BREVO EMAIL ERROR:", emailError);

                // rollback user creation
                await strapi.db
                    .query("plugin::users-permissions.user")
                    .delete({
                        where: {
                            id: user.id,
                        },
                    });

                return ctx.badRequest({
                    success: false,
                    message: "Failed to send verification email",
                    error:
                        emailError?.response?.body ||
                        emailError?.message ||
                        "Unknown email error",
                });
            }
        } catch (error: any) {
            console.error("REGISTER ERROR:", error);

            return handleControllerError(ctx, error, "Registration failed");
        }
    },

    async verifyEmail(ctx) {
        const { token } = ctx.query;

        if (!token) {
            return ctx.badRequest("Invalid token");
        }

        const user = await strapi.db
            .query("plugin::users-permissions.user")
            .findOne({
                where: { confirmationToken: token },
            });

        if (!user) {
            return ctx.badRequest("Invalid or expired link");
        }

        const updatedUser = await strapi.db
            .query("plugin::users-permissions.user")
            .update({
                where: { id: user.id },
                data: {
                    confirmed: true,
                    confirmationToken: null,
                    isActive: true,
                },
            });

        notificationService
            .notifyUserActivated(strapi, updatedUser || user)
            .catch((err) =>
                strapi.log.error(
                    "Failed notification for user email verification activation:",
                    err
                )
            );

        ctx.redirect(`${process.env.FRONTEND_URL}/login`);
    },

    async login(ctx: any) {
        const { email, password } = ctx.request.body;

        if (!email || !password) {
            return ctx.badRequest("Email and password are required");
        }

        const user = await strapi.db
            .query("plugin::users-permissions.user")
            .findOne({
                where: {
                    email: email.toLowerCase(),
                },
                populate: {
                    role: true,
                },
            });

        if (!user) {
            return ctx.badRequest("Invalid credentials");
        }

        const validPassword = await strapi
            .plugin("users-permissions")
            .service("user")
            .validatePassword(password, user.password);

        if (!validPassword) {
            return ctx.badRequest("Invalid credentials");
        }

        if (user.blocked) {
            return ctx.forbidden("Account is blocked");
        }

        if (!user.confirmed) {
            return ctx.badRequest(
                "Please verify your email before logging in"
            );
        }

        const jwt = strapi
            .plugin("users-permissions")
            .service("jwt")
            .issue({
                id: user.id,
            });

        delete user.password;
        delete user.resetPasswordToken;
        delete user.confirmationToken;

        return ctx.send({
            success: true,
            jwt,
            user,
        });
    },

};