/**
 * blog controller
 */

import { factories } from "@strapi/strapi";
import { handleControllerError } from "../../../utils/errorHandler";

function getIdOrDocumentIdFilter(value: any) {
  if (!value) return null;
  const str = String(value).trim();
  if (/^\d+$/.test(str)) {
    return {
      $or: [{ id: Number(str) }, { documentId: str }],
    };
  }
  return { documentId: str };
}

export default factories.createCoreController(
  "api::blog.blog",
  ({ strapi }) => ({
    /**
     * Get all blogs (getAll)
     * GET /api/blogs
     */
    async find(ctx) {
      try {
        const { query } = ctx;

        const blogs = await strapi.documents("api::blog.blog").findMany({
          ...query,
          populate: (query?.populate as any) || "*",
          sort: (query?.sort as any) || ["createdAt:desc"],
        });

        const sanitizedBlogs = await this.sanitizeOutput(blogs, ctx);
        return this.transformResponse(sanitizedBlogs);
      } catch (error: any) {
        strapi.log.error("Find Blogs Error:", error);
        return handleControllerError(ctx, error, "Failed to fetch blogs");
      }
    },

    /**
     * Get a single blog by ID or documentId
     * GET /api/blogs/:id
     */
    async findOne(ctx) {
      try {
        const { id } = ctx.params;
        const filter = getIdOrDocumentIdFilter(id);

        if (!filter) {
          return ctx.badRequest("Invalid blog ID or documentId");
        }

        const blog = await strapi.documents("api::blog.blog").findFirst({
          filters: filter,
          populate: (ctx.query?.populate as any) || "*",
        });

        if (!blog) {
          return ctx.notFound("Blog post not found");
        }

        const sanitizedBlog = await this.sanitizeOutput(blog, ctx);
        return this.transformResponse(sanitizedBlog);
      } catch (error: any) {
        strapi.log.error("Find One Blog Error:", error);
        return handleControllerError(ctx, error, "Failed to fetch blog post");
      }
    },

    /**
     * Get a blog by slug
     * GET /api/blogs/slug/:slug or /api/blogs/findBySlug/:slug
     */
    async findBySlug(ctx) {
      try {
        const { slug } = ctx.params;
        const targetSlug =
          slug ||
          (ctx.query?.slug as string) ||
          (ctx.query?.blog_slug as string);

        if (!targetSlug) {
          return ctx.badRequest("Slug parameter is required");
        }

        const entity = await strapi.documents("api::blog.blog").findFirst({
          filters: {
            $or: [
              { blog_slug: targetSlug },
              { blog_slug: decodeURIComponent(targetSlug) },
            ],
          },
          populate: (ctx.query?.populate as any) || "*",
        });

        if (!entity) {
          return ctx.notFound("Blog post not found");
        }

        const sanitizedEntity = await this.sanitizeOutput(entity, ctx);
        return sanitizedEntity;
      } catch (error: any) {
        strapi.log.error("Find Blog By Slug Error:", error);
        return handleControllerError(ctx, error, "Failed to fetch blog post by slug");
      }
    },

    /**
     * Create a new blog post
     * POST /api/blogs
     */
    async create(ctx) {
      try {
        const body = ctx.request.body?.data || ctx.request.body || {};

        if (!body.blog_title) {
          return ctx.badRequest("blog_title is required");
        }

        const newBlog = await strapi.documents("api::blog.blog").create({
          data: {
            ...body,
            publishedAt: body.publishedAt || new Date().toISOString(),
          },
          populate: (ctx.query?.populate as any) || "*",
          status: "published",
        });

        return ctx.send({
          success: true,
          message: "Blog post create successfully",
        });
      } catch (error: any) {
        strapi.log.error("Create Blog Error:", error);
        return handleControllerError(ctx, error, "Failed to create blog post");
      }
    },

    /**
     * Update an existing blog post by ID or documentId
     * PUT /api/blogs/:id
     */
    async update(ctx) {
      try {
        const { id } = ctx.params;
        const filter = getIdOrDocumentIdFilter(id);

        if (!filter) {
          return ctx.badRequest("Invalid blog ID or documentId");
        }

        const existingBlog = await strapi
          .documents("api::blog.blog")
          .findFirst({
            filters: filter,
          });

        if (!existingBlog) {
          return ctx.notFound("Blog post not found");
        }

        const body = ctx.request.body?.data || ctx.request.body || {};
        const docId = existingBlog.documentId || existingBlog.id;

        await strapi.documents("api::blog.blog").update({
          documentId: docId as string,
          data: body,
          populate: (ctx.query?.populate as any) || "*",
          status: "published",
        });

        return ctx.send({
          success: true,
          message: "Blog post update successfully",
        });
      } catch (error: any) {
        strapi.log.error("Update Blog Error:", error);
        return handleControllerError(ctx, error, "Failed to update blog post");
      }
    },

    /**
     * Delete a blog post by ID or documentId
     * DELETE /api/blogs/:id
     */
    async delete(ctx) {
      try {
        const { id } = ctx.params;
        const filter = getIdOrDocumentIdFilter(id);

        if (!filter) {
          return ctx.badRequest("Invalid blog ID or documentId");
        }

        const existingBlog = await strapi
          .documents("api::blog.blog")
          .findFirst({
            filters: filter,
          });

        if (!existingBlog) {
          return ctx.notFound("Blog post not found");
        }

        const docId = existingBlog.documentId || existingBlog.id;

        await strapi.documents("api::blog.blog").delete({
          documentId: docId as string,
        });

        return ctx.send({
          success: true,
          message: "Blog post deleted successfully",
        });
      } catch (error: any) {
        strapi.log.error("Delete Blog Error:", error);
        return handleControllerError(ctx, error, "Failed to delete blog post");
      }
    },
  }),
);
