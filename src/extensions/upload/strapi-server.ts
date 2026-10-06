import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import type { Sharp, Metadata, OutputInfo } from 'sharp';
import utils from '@strapi/utils';
import type { Core } from '@strapi/strapi';

declare const strapi: Core.Strapi;

const { bytesToKbytes } = utils.file;

const FORMATS_TO_OPTIMIZE = ['jpeg', 'jpg', 'png', 'webp', 'tiff', 'avif'];

const isOptimizableFormat = (format?: string) =>
  Boolean(format && FORMATS_TO_OPTIMIZE.includes(format.toLowerCase()));

const writeStreamToFile = (stream: NodeJS.ReadableStream, destPath: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(destPath);
    stream.on('error', reject);
    stream.pipe(writeStream);
    writeStream.on('close', () => resolve());
    writeStream.on('error', reject);
  });

/**
 * Apply format-specific compression settings using sharp
 */
const applyFormatCompression = (transformer: Sharp, format: string): Sharp => {
  const fmt = format.toLowerCase();
  switch (fmt) {
    case 'jpeg':
    case 'jpg':
      return transformer.jpeg({
        quality: 80,
        mozjpeg: true,
        progressive: true,
      });
    case 'png':
      return transformer.png({
        compressionLevel: 8,
        quality: 80,
        effort: 7,
      });
    case 'webp':
      return transformer.webp({
        quality: 80,
        effort: 4,
      });
    case 'avif':
      return transformer.avif({
        quality: 75,
        effort: 4,
      });
    case 'tiff':
      return transformer.tiff({
        quality: 80,
        compression: 'deflate',
      });
    default:
      return transformer;
  }
};

const getMetadata = (file: any): Promise<Metadata> => {
  if (!file.filepath) {
    return new Promise((resolve, reject) => {
      const pipeline = sharp();
      pipeline.metadata().then(resolve).catch(reject);
      file.getStream().pipe(pipeline);
    });
  }
  return sharp(file.filepath).metadata();
};

const THUMBNAIL_RESIZE_OPTIONS = {
  width: 245,
  height: 156,
  fit: 'inside' as const,
};

export default (plugin: any) => {
  const originalService = plugin.services['image-manipulation'];

  const isOptimizableImage = async (file: any) => {
    let format;
    try {
      const metadata = await getMetadata(file);
      format = metadata.format;
    } catch {
      return false;
    }
    return Boolean(format && FORMATS_TO_OPTIMIZE.includes(format.toLowerCase()));
  };

  const resizeFileTo = async (file: any, options: any, { name, hash }: { name: string; hash: string }) => {
    const filePath = file.tmpWorkingDirectory ? path.join(file.tmpWorkingDirectory, hash) : hash;
    let newInfo: OutputInfo | undefined;

    let metadata: Metadata | undefined;
    try {
      metadata = await getMetadata(file);
    } catch {
      // Ignored
    }

    const format = metadata?.format || file.ext?.replace('.', '') || 'jpeg';

    if (!file.filepath) {
      let transform = sharp({ animated: true }).resize(options);
      if (isOptimizableFormat(format)) {
        transform = applyFormatCompression(transform, format);
      }
      transform.on('info', (info: OutputInfo) => {
        newInfo = info;
      });
      await writeStreamToFile(file.getStream().pipe(transform), filePath);
    } else {
      let transform = sharp(file.filepath, { animated: true }).resize(options);
      if (isOptimizableFormat(format)) {
        transform = applyFormatCompression(transform, format);
      }
      newInfo = await transform.toFile(filePath);
    }

    const { width, height, size, pageHeight } = newInfo ?? {};
    const newFile = {
      name,
      hash,
      ext: file.ext,
      mime: file.mime,
      filepath: filePath,
      path: file.path || null,
      getStream: () => fs.createReadStream(filePath),
      width,
      height: pageHeight ?? height,
      size: size ? bytesToKbytes(size) : 0,
      sizeInBytes: size,
    };

    return newFile;
  };

  const generateThumbnail = async (file: any) => {
    if (
      file.width &&
      file.height &&
      (file.width > THUMBNAIL_RESIZE_OPTIONS.width || file.height > THUMBNAIL_RESIZE_OPTIONS.height)
    ) {
      return resizeFileTo(file, THUMBNAIL_RESIZE_OPTIONS, {
        name: `thumbnail_${file.name}`,
        hash: `thumbnail_${file.hash}`,
      });
    }
    return null;
  };

  const DEFAULT_BREAKPOINTS = {
    xlarge: 1920,
    large: 1000,
    medium: 750,
    small: 500,
  };

  const getBreakpoints = () => strapi.config.get('plugin::upload.breakpoints', DEFAULT_BREAKPOINTS);

  const breakpointSmallerThan = (breakpoint: number, { width, height }: { width?: number | null; height?: number | null }) => {
    return breakpoint < (width ?? 0) || breakpoint < (height ?? 0);
  };

  const generateBreakpoint = async (key: string, { file, breakpoint }: { file: any; breakpoint: number }) => {
    const newFile = await resizeFileTo(
      file,
      {
        width: breakpoint,
        height: breakpoint,
        fit: 'inside',
      },
      {
        name: `${key}_${file.name}`,
        hash: `${key}_${file.hash}`,
      }
    );
    return {
      key,
      file: newFile,
    };
  };

  const generateResponsiveFormats = async (file: any) => {
    const originalDimensions = await originalService.getDimensions(file);
    const breakpoints = getBreakpoints();
    const results: any[] = [];
    for (const key of Object.keys(breakpoints)) {
      const breakpoint = breakpoints[key];
      if (breakpointSmallerThan(breakpoint, originalDimensions)) {
        results.push(
          await generateBreakpoint(key, {
            file,
            breakpoint,
          })
        );
      }
    }
    return results;
  };

  /**
   * Automatic image compression on upload with real-time stats logging
   */
  const optimize = async (file: any) => {
    try {
      const metadata = await getMetadata(file);
      const { format, size } = metadata;
      const originalSize = file.sizeInBytes || (size ? size : (file.size ? Math.round(file.size * 1024) : 0));

      if (isOptimizableFormat(format)) {
        let transformer = file.filepath
          ? sharp(file.filepath, { animated: true })
          : sharp({ animated: true });

        // Auto-orient based on EXIF
        transformer = transformer.rotate();

        // Apply compression (JPEG mozjpeg, PNG compressionLevel, WebP quality, etc.)
        transformer = applyFormatCompression(transformer, format!);

        const filePath = file.tmpWorkingDirectory
          ? path.join(file.tmpWorkingDirectory, `optimized-${file.hash}`)
          : `optimized-${file.hash}`;

        let newInfo: OutputInfo | undefined;
        if (!file.filepath) {
          transformer.on('info', (info: OutputInfo) => {
            newInfo = info;
          });
          await writeStreamToFile(file.getStream().pipe(transformer), filePath);
        } else {
          newInfo = await transformer.toFile(filePath);
        }

        const { width: newWidth, height: newHeight, size: newSize, pageHeight: newPageHeight } = newInfo ?? {};

        if (newSize) {
          const originalKB = ((originalSize || newSize) / 1024).toFixed(1);
          const compressedKB = (newSize / 1024).toFixed(1);
          const savedPercent = originalSize && originalSize > newSize
            ? (((originalSize - newSize) / originalSize) * 100).toFixed(1)
            : '0';

          const displayName = file.name?.endsWith(file.ext || '') ? file.name : `${file.name || 'image'}${file.ext || ''}`;
          console.log(
            `\x1b[32m[Image Compression]\x1b[0m 🖼️  ${displayName} (${format?.toUpperCase()}): ` +
            `\x1b[33m${originalKB} KB\x1b[0m ➔ \x1b[32m${compressedKB} KB\x1b[0m (\x1b[36m${savedPercent}% saved\x1b[0m)`
          );

          if (!originalSize || newSize <= originalSize) {
            const newFile = {
              ...file,
              filepath: filePath,
              getStream: () => fs.createReadStream(filePath),
              width: newWidth || file.width,
              height: (newPageHeight ?? newHeight) || file.height,
              size: bytesToKbytes(newSize),
              sizeInBytes: newSize,
            };
            return newFile;
          }
        }
      }
    } catch (err: any) {
      if (strapi?.log?.warn) {
        strapi.log.warn(`[Image Compression] Could not compress image: ${err?.message || err}. Uploading original.`);
      } else {
        console.warn(`[Image Compression] Could not compress image: ${err?.message || err}.`);
      }
    }

    return file;
  };

  plugin.services['image-manipulation'] = {
    ...originalService,
    optimize,
    isOptimizableImage,
    generateThumbnail,
    generateResponsiveFormats,
  };

  return plugin;
};
