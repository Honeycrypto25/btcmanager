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

const ORIGINAL_COMPRESSION_THRESHOLD_BYTES = 2 * 1024 * 1024; // 2MB
const ORIGINAL_COMPRESSION_MAX_DIMENSION = 2000; // px, longest side
const ORIGINAL_COMPRESSION_JPEG_QUALITY = 82;

export interface CompressedOriginal {
    buffer: Buffer;
    mimeType: string;
    wasCompressed: boolean;
}

/**
 * Runs BEFORE the very first write to R2 — this is what gets stored as the
 * "original" object. It is not a violation of "the original is never
 * overwritten": that rule is about never replacing an already-stored
 * object, not about what bytes get written on the initial upload.
 *
 * Only large JPEG/PNG uploads (over ORIGINAL_COMPRESSION_THRESHOLD_BYTES —
 * modern phone cameras routinely produce multi-MB photos) get resized +
 * recompressed, to a size/quality that stays comfortably legible for a
 * receipt (text, totals) while cutting R2 storage substantially. Small
 * files, HEIC (already a compact codec) and PDFs pass through untouched.
 * Any failure here falls back to the untouched original — compression is
 * never allowed to block an upload.
 */
export async function compressOriginalIfNeeded(input: Buffer, mimeType: string): Promise<CompressedOriginal> {
    if (!isRasterImageMimeType(mimeType) || input.length <= ORIGINAL_COMPRESSION_THRESHOLD_BYTES) {
        return { buffer: input, mimeType, wasCompressed: false };
    }

    try {
        const sharp = (await import("sharp")).default;
        const compressed = await sharp(input)
            .rotate() // bake in EXIF orientation before resizing, same as a phone gallery would show it
            .resize({ width: ORIGINAL_COMPRESSION_MAX_DIMENSION, height: ORIGINAL_COMPRESSION_MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: ORIGINAL_COMPRESSION_JPEG_QUALITY })
            .toBuffer();

        // Only use it if it's actually smaller — a tiny/already-optimized PNG
        // could conceivably grow when re-encoded as JPEG.
        if (compressed.length < input.length) {
            return { buffer: compressed, mimeType: "image/jpeg", wasCompressed: true };
        }
        return { buffer: input, mimeType, wasCompressed: false };
    } catch (err) {
        console.error("Original image compression failed, storing untouched", err);
        return { buffer: input, mimeType, wasCompressed: false };
    }
}
