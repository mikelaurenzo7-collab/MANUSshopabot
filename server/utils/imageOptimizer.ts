import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { storagePut } from "../storage";
import axios from "axios";
import { logger } from "./logger";

/**
 * Downloads a raw image buffer, optimizes it for specific e-commerce or social specs, 
 * and uploads to our managed bucket.
 */
export async function optimizeAndUploadImage(
  sourceUrl: string, 
  dimension: number = 1080
): Promise<string> {
  try {
    // 1. Fetch raw remote image buffer
    const response = await axios.get(sourceUrl, { responseType: 'arraybuffer' });
    const rawBuffer = Buffer.from(response.data);

    // 2. Compress and resize using the heavy-duty sharp C++ engine
    const optimizedBuffer = await sharp(rawBuffer)
      .resize(dimension, dimension, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80, effort: 6 }) 
      .toBuffer();

    // 3. Upload to storage. Use crypto.randomUUID for the suffix —
    // Math.random().toString(36).substring(7) is only ~5 base-36
    // chars (~60M values) from a non-CSPRNG, so a high-throughput
    // product import in the same millisecond had a real collision
    // risk where one user's optimized image could overwrite another's.
    const filename = `optimized-${Date.now()}-${randomUUID()}.webp`;
    const result = await storagePut(filename, optimizedBuffer, 'image/webp');
    
    return result.url;
  } catch (error) {
    logger.error("image_optimization_failed", {
      module: "imageOptimizer",
      sourceUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    // Silent fallback to original URL on failure to avoid halting workflows
    return sourceUrl;
  }
}

/**
 * Fetches an image from a URL and returns it as an optimized buffer.
 * Useful for scenarios where we need to submit a raw buffer via API rather than a URL (e.g. Twitter Media Upload).
 */
export async function fetchOptimizedBuffer(
  sourceUrl: string,
  dimension: number = 1080,
  format: "jpeg" | "png" | "webp" = "jpeg" // Twitter generally prefers JPEG for static
): Promise<Buffer> {
  const response = await axios.get(sourceUrl, { responseType: 'arraybuffer' });
  const rawBuffer = Buffer.from(response.data);

  const pipeline = sharp(rawBuffer).resize(dimension, dimension, { fit: 'inside', withoutEnlargement: true });
  
  if (format === "jpeg") {
    return pipeline.jpeg({ quality: 85 }).toBuffer();
  } else if (format === "png") {
    return pipeline.png({ quality: 80 }).toBuffer();
  } else {
    return pipeline.webp({ quality: 80 }).toBuffer();
  }
}


// ─── Product Image Multi-Size Optimization ────────────────────────────

export const IMAGE_SIZES = {
  thumbnail: { width: 150, height: 150, label: 'thumb' },
  small: { width: 300, height: 300, label: 'sm' },
  medium: { width: 600, height: 600, label: 'md' },
  large: { width: 1000, height: 1000, label: 'lg' },
  xlarge: { width: 1500, height: 1500, label: 'xl' },
} as const;

export type ImageSize = keyof typeof IMAGE_SIZES;

interface OptimizeOptions {
  sizes?: ImageSize[];
  formats?: ('webp' | 'avif' | 'jpeg' | 'png')[];
  quality?: number;
  removeMetadata?: boolean;
}

interface OptimizedImage {
  format: string;
  size: string;
  url: string;
  width: number;
  height: number;
  fileSize: number;
}

/**
 * Optimizes a product image into multiple sizes and formats for responsive display
 */
export async function optimizeProductImage(
  imageBuffer: Buffer,
  productId: string,
  options: OptimizeOptions = {}
): Promise<OptimizedImage[]> {
  const {
    sizes = ['thumbnail', 'medium', 'large'],
    formats = ['webp', 'jpeg'],
    quality = 80,
    removeMetadata = true,
  } = options;

  const results: OptimizedImage[] = [];

  try {
    // Validate image
    const metadata = await sharp(imageBuffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Invalid image: missing dimensions');
    }

    logger.info("image_optimizer_processing", {
      module: "imageOptimizer",
      productId,
      originalSize: imageBuffer.length,
      dimensions: `${metadata.width}x${metadata.height}`,
      format: metadata.format,
    });

    // Generate each size in each format
    for (const sizeKey of sizes) {
      const sizeConfig = IMAGE_SIZES[sizeKey];

      for (const format of formats) {
        let pipeline = sharp(imageBuffer)
          .resize(sizeConfig.width, sizeConfig.height, {
            fit: 'cover',
            position: 'center',
          });

        // Apply format-specific optimization
        let buffer: Buffer;
        let mimeType: string;

        switch (format) {
          case 'webp':
            pipeline = pipeline.webp({ quality });
            mimeType = 'image/webp';
            break;
          case 'avif':
            pipeline = pipeline.avif({ quality });
            mimeType = 'image/avif';
            break;
          case 'jpeg':
            pipeline = pipeline.jpeg({ quality, progressive: true });
            mimeType = 'image/jpeg';
            break;
          case 'png':
            pipeline = pipeline.png({ compressionLevel: 9 });
            mimeType = 'image/png';
            break;
        }

        if (removeMetadata) {
          pipeline = pipeline.withMetadata();
        }

        buffer = await pipeline.toBuffer();

        // Upload to S3
        const fileKey = `products/${productId}/images/${sizeConfig.label}.${format}`;
        const { url } = await storagePut(fileKey, buffer, mimeType);

        results.push({
          format,
          size: sizeKey,
          url,
          width: sizeConfig.width,
          height: sizeConfig.height,
          fileSize: buffer.length,
        });

        logger.info("image_optimizer_generated", {
          module: "imageOptimizer",
          sizeKey,
          format,
          fileSize: buffer.length,
          url,
        });
      }
    }

    return results;
  } catch (err) {
    logger.error("image_optimizer_failed", {
      module: "imageOptimizer",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Get statistics on image optimization savings
 */
export async function getImageStats(
  originalBuffer: Buffer,
  optimizedImages: OptimizedImage[]
): Promise<{
  originalSize: number;
  optimizedSize: number;
  savings: number;
  savingsPercent: number;
}> {
  const originalSize = originalBuffer.length;
  const optimizedSize = optimizedImages.reduce((sum, img) => sum + img.fileSize, 0);
  const savings = originalSize - optimizedSize;
  const savingsPercent = Math.round((savings / originalSize) * 100);

  return {
    originalSize,
    optimizedSize,
    savings,
    savingsPercent,
  };
}
