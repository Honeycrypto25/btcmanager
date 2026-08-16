import "server-only";

/**
 * HEIC/HEIF (the default format for iPhone camera photos) is not renderable
 * by an <img> tag in any mainstream browser. We keep the original HEIC file
 * untouched in R2 (per spec — never overwrite the original), but generate a
 * browser-viewable WebP preview at upload time so the receipt detail page
 * actually shows the photo.
 *
 * heic-convert decodes HEIC/HEIF to JPEG (pure JS/WASM, no native deps —
 * works in Vercel's serverless Node runtime). sharp then re-encodes that
 * JPEG to a resized WebP, which it can do without any HEIC-specific
 * codec support.
 */
export async function generateHeicPreview(input: Buffer): Promise<Buffer | null> {
    try {
        const heicConvert = (await import("heic-convert")).default;
        const sharp = (await import("sharp")).default;

        const jpegArrayBuffer = await heicConvert({
            buffer: input,
            format: "JPEG",
            quality: 0.9,
        });

        const webpBuffer = await sharp(Buffer.from(jpegArrayBuffer))
            .resize({ width: 1600, withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer();

        return webpBuffer;
    } catch (err) {
        console.error("HEIC preview conversion failed", err);
        return null;
    }
}

export function isHeicMimeType(mimeType: string): boolean {
    return mimeType === "image/heic" || mimeType === "image/heif";
}

/**
 * JPEG/PNG receipt photos ARE renderable directly in a browser (unlike
 * HEIC), so this preview isn't about compatibility — it's about storage
 * size: a resized WebP is typically a fraction of the size of a full-
 * resolution phone camera photo. The original is still never touched or
 * overwritten; this is purely an additional, smaller object used for
 * everyday viewing, while "Vezi / descarcă fișierul original" still
 * serves the untouched original on request.
 */
export async function generateStandardImagePreview(input: Buffer): Promise<Buffer | null> {
    try {
        const sharp = (await import("sharp")).default;
        return await sharp(input)
            .resize({ width: 1600, withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer();
    } catch (err) {
        console.error("Standard image preview conversion failed", err);
        return null;
    }
}

export function isRasterImageMimeType(mimeType: string): boolean {
    return mimeType === "image/jpeg" || mimeType === "image/jpg" || mimeType === "image/png";
}
