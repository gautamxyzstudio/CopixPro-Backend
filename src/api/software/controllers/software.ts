/**
 * software controller
 * Specifically handles updating software_url and user_manual_pdf files
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

function formatMediaUrl(media: any, fallbackUrl?: string | null): string | null {
  if (media && typeof media === "object" && media.url) {
    const url = String(media.url).trim();
    if (url) {
      if (url.startsWith("http://") || url.startsWith("https://")) {
        return url;
      }
      const backendUrl = (
        process.env.BACKEND_URL || "http://localhost:1338"
      ).replace(/\/$/, "");
      const cleanUrl = url.startsWith("/") ? url : `/${url}`;
      return `${backendUrl}${cleanUrl}`;
    }
  }
  if (fallbackUrl && typeof fallbackUrl === "string" && fallbackUrl.trim()) {
    const url = fallbackUrl.trim();
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    const backendUrl = (
      process.env.BACKEND_URL || "http://localhost:1338"
    ).replace(/\/$/, "");
    const cleanUrl = url.startsWith("/") ? url : `/${url}`;
    return `${backendUrl}${cleanUrl}`;
  }
  return null;
}

function extractFile(files: any, names: string[]): any {
  if (!files || typeof files !== "object") return null;
  for (const name of names) {
    if (files[name]) {
      const val = files[name];
      return Array.isArray(val) ? val[0] : val;
    }
  }
  return null;
}

async function safelyCleanMorphRelation(
  strapi: any,
  softwareNumericId: number,
  field: string
) {
  try {
    if (strapi.db?.connection) {
      await strapi.db
        .connection("files_related_mph")
        .where({
          related_id: softwareNumericId,
          related_type: "api::software.software",
          field,
        })
        .delete();
    }
  } catch (err) {
    strapi.log.warn(`Could not clear old morph relation for ${field}:`, err);
  }
}

async function safelyInsertMorphRelation(
  strapi: any,
  fileId: number,
  softwareNumericId: number,
  field: string
) {
  try {
    await safelyCleanMorphRelation(strapi, softwareNumericId, field);
    if (strapi.db?.connection) {
      await strapi.db.connection("files_related_mph").insert({
        file_id: fileId,
        related_id: softwareNumericId,
        related_type: "api::software.software",
        field,
        order: 1,
      });
    }
  } catch (err) {
    strapi.log.warn(`Could not insert morph relation for ${field}:`, err);
  }
}

async function resolveTargetSoftware(strapi: any, ctx: any, body: any): Promise<any> {
  const targetId = ctx.params?.id || body.id || body.documentId || body.softwareId;

  if (targetId) {
    const filter = getIdOrDocumentIdFilter(targetId);
    if (filter) {
      const found = await strapi.documents("api::software.software").findFirst({
        filters: filter,
        populate: ["software_url", "user_manual_pdf"],
      });
      if (found) return found;
    }
  }

  // Default to first existing software record
  let defaultSoftware = await strapi
    .documents("api::software.software")
    .findFirst({
      populate: ["software_url", "user_manual_pdf"],
    });

  if (!defaultSoftware) {
    defaultSoftware = await strapi
      .documents("api::software.software")
      .create({
        data: { name: "CopixPro" },
        status: "published",
        populate: ["software_url", "user_manual_pdf"],
      });
  }

  return defaultSoftware;
}

/**
 * Controller logic to update software_url and user_manual_pdf files
 */
async function updateSoftwareFilesHandler(strapi: any, ctx: any) {
  try {
    let body = ctx.request.body || {};
    if (typeof body.data === "string") {
      try {
        body = { ...body, ...JSON.parse(body.data) };
      } catch {
        // use raw body
      }
    } else if (body.data && typeof body.data === "object") {
      body = { ...body, ...body.data };
    }

    const files = ctx.request.files || (ctx as any).files || {};

    // 1. Identify software_url file or manual file from uploaded files
    let softwareFile = extractFile(files, [
      "software_url",
      "files.software_url",
      "software",
      "softwareFile",
      "software_file",
    ]);

    let manualFile = extractFile(files, [
      "user_manual_pdf",
      "files.user_manual_pdf",
      "user_manual",
      "userManual",
      "manual",
      "manualFile",
      "pdf",
    ]);

    // Handle generic 'file' with field/fileType hint
    const genericFile = extractFile(files, ["file", "files"]);
    if (genericFile && !softwareFile && !manualFile) {
      const hint = String(body.field || body.fileType || "").toLowerCase();
      if (hint.includes("manual") || hint.includes("pdf")) {
        manualFile = genericFile;
      } else {
        softwareFile = genericFile;
      }
    }

    // Check if at least one file or media value is provided
    const hasSoftwareInput = Boolean(
      softwareFile ||
      body.software_url !== undefined ||
      body.downloadFileUrl !== undefined
    );
    const hasManualInput = Boolean(
      manualFile ||
      body.user_manual_pdf !== undefined
    );

    if (!hasSoftwareInput && !hasManualInput) {
      return ctx.badRequest(
        "Please provide software_url or user_manual_pdf file to update"
      );
    }

    // 2. Resolve the target software entry
    const targetSoftware = await resolveTargetSoftware(strapi, ctx, body);
    if (!targetSoftware) {
      return ctx.notFound("Software record not found");
    }

    let softwareNumericId = targetSoftware.id;
    if (!softwareNumericId && targetSoftware.documentId) {
      const dbEntry = await strapi.db
        .query("api::software.software")
        .findOne({
          where: { documentId: targetSoftware.documentId },
          select: ["id"],
        });
      softwareNumericId = dbEntry?.id;
    }

    if (!softwareNumericId) {
      return ctx.internalServerError("Could not find software numeric ID");
    }

    const uploadService = strapi.plugin("upload").service("upload");

    // 3. Process software_url file upload
    if (softwareFile) {
      await safelyCleanMorphRelation(strapi, softwareNumericId, "software_url");
      await uploadService.upload({
        data: {
          refId: softwareNumericId,
          ref: "api::software.software",
          field: "software_url",
        },
        files: softwareFile,
      });
    } else if (body.software_url !== undefined) {
      // Existing media ID or URL string
      if (
        typeof body.software_url === "number" ||
        (typeof body.software_url === "string" && /^\d+$/.test(body.software_url.trim()))
      ) {
        const fileId = Number(String(body.software_url).trim());
        await safelyInsertMorphRelation(strapi, fileId, softwareNumericId, "software_url");
      } else if (typeof body.software_url === "object" && body.software_url?.id) {
        const fileId = Number(body.software_url.id);
        await safelyInsertMorphRelation(strapi, fileId, softwareNumericId, "software_url");
      } else if (typeof body.software_url === "string" && body.software_url.trim()) {
        await strapi.documents("api::software.software").update({
          documentId: targetSoftware.documentId,
          data: { downloadFileUrl: body.software_url.trim() },
          status: "published",
        });
      }
    }

    // Optional downloadFileUrl string update
    if (body.downloadFileUrl && typeof body.downloadFileUrl === "string") {
      await strapi.documents("api::software.software").update({
        documentId: targetSoftware.documentId,
        data: { downloadFileUrl: body.downloadFileUrl.trim() },
        status: "published",
      });
    }

    // 4. Process user_manual_pdf file upload
    if (manualFile) {
      await safelyCleanMorphRelation(strapi, softwareNumericId, "user_manual_pdf");
      await uploadService.upload({
        data: {
          refId: softwareNumericId,
          ref: "api::software.software",
          field: "user_manual_pdf",
        },
        files: manualFile,
      });
    } else if (body.user_manual_pdf !== undefined) {
      // Existing media ID
      if (
        typeof body.user_manual_pdf === "number" ||
        (typeof body.user_manual_pdf === "string" && /^\d+$/.test(body.user_manual_pdf.trim()))
      ) {
        const fileId = Number(String(body.user_manual_pdf).trim());
        await safelyInsertMorphRelation(strapi, fileId, softwareNumericId, "user_manual_pdf");
      } else if (typeof body.user_manual_pdf === "object" && body.user_manual_pdf?.id) {
        const fileId = Number(body.user_manual_pdf.id);
        await safelyInsertMorphRelation(strapi, fileId, softwareNumericId, "user_manual_pdf");
      }
    }

    // 5. Fetch updated software with fresh media relations
    const updatedSoftware = await strapi
      .documents("api::software.software")
      .findOne({
        documentId: targetSoftware.documentId,
        populate: ["software_url", "user_manual_pdf"],
      });

    const software_url = formatMediaUrl(
      updatedSoftware?.software_url,
      updatedSoftware?.downloadFileUrl
    );
    const user_manual_pdf = formatMediaUrl(updatedSoftware?.user_manual_pdf);

    return ctx.send({
      success: true,
      message: "Software files updated successfully",
      software_url,
      user_manual_pdf,
      data: {
        id: updatedSoftware?.id,
        documentId: updatedSoftware?.documentId,
        name: updatedSoftware?.name,
        downloadFileUrl: updatedSoftware?.downloadFileUrl || null,
        software_url,
        user_manual_pdf,
        raw_software_url: updatedSoftware?.software_url || null,
        raw_user_manual_pdf: updatedSoftware?.user_manual_pdf || null,
        updatedAt: updatedSoftware?.updatedAt,
      },
    });
  } catch (error: any) {
    strapi.log.error("Update Software Files Error:", error);
    return handleControllerError(
      ctx,
      error,
      "Failed to update software files"
    );
  }
}

export default factories.createCoreController(
  "api::software.software",
  ({ strapi }) => ({
    /**
     * PUT /api/softwares/:id
     * Update software files (software_url and/or user_manual_pdf)
     */
    async update(ctx) {
      return updateSoftwareFilesHandler(strapi, ctx);
    },

    /**
     * PUT /api/softwares/update-files
     * POST /api/softwares/update-files
     * Update software files without requiring :id in URL
     */
    async updateFiles(ctx) {
      return updateSoftwareFilesHandler(strapi, ctx);
    },
  })
);
