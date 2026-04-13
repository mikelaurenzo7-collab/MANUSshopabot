import sharp from "sharp";
import { storagePut } from "../storage"; 
import axios from "axios";

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

    // 3. Upload to storage
    const filename = `optimized-${Date.now()}-${Math.random().toString(36).substring(7)}.webp`;
    const result = await storagePut(filename, optimizedBuffer, 'image/webp');
    
    return result.url;
  } catch (error) {
    console.error("Error optimizing image:", error);
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
