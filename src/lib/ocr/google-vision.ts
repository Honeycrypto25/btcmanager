import "server-only";
import { createSign } from "crypto";

/**
 * Minimal Google Cloud Vision client — just enough to call TEXT_DETECTION
 * on a single image. Deliberately doesn't pull in the @google-cloud/vision
 * SDK (which drags in gRPC) or google-auth-library — a service account's
 * OAuth2 access token is just a self-signed RS256 JWT exchanged at Google's
 * token endpoint, and Node's built-in `crypto` module already does RS256
 * signing (the same module already used elsewhere in this app, e.g. the
 * 2FA cookie signing), so no new dependency is needed.
 *
 * Configuration (Vercel env vars, set manually — see /tasks for status):
 *   GOOGLE_VISION_CLIENT_EMAIL — the service account's client_email
 *   GOOGLE_VISION_PRIVATE_KEY  — the service account's private_key (PEM).
 *     Vercel's env var editor accepts real newlines directly; if the value
 *     ever ends up with literal "\n" escape sequences instead (e.g. pasted
 *     through a tool that collapses newlines), this reads either form.
 */

interface VisionCredentials {
    clientEmail: string;
    privateKey: string;
}

function getCredentials(): VisionCredentials | null {
    const clientEmail = process.env.GOOGLE_VISION_CLIENT_EMAIL;
    const rawKey = process.env.GOOGLE_VISION_PRIVATE_KEY;
    if (!clientEmail || !rawKey) return null;
    const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
    return { clientEmail, privateKey };
}

export function isVisionConfigured(): boolean {
    return getCredentials() !== null;
}

function base64url(input: Buffer | string): string {
    const buf = typeof input === "string" ? Buffer.from(input) : input;
    return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(creds: VisionCredentials): Promise<string> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const claims = {
        iss: creds.clientEmail,
        scope: "https://www.googleapis.com/auth/cloud-platform",
        aud: "https://oauth2.googleapis.com/token",
        iat: nowSeconds,
        exp: nowSeconds + 3600,
    };
    const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;

    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    signer.end();
    const signature = signer.sign(creds.privateKey);
    const jwt = `${unsigned}.${base64url(signature)}`;

    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt,
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Google OAuth token request failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) throw new Error("Google OAuth token response had no access_token.");
    return data.access_token;
}

/** Vision's images:annotate endpoint accepts common raster formats directly
 * — HEIC is not one of them, so HEIC receipts must go through their
 * already-generated JPEG/WebP preview instead (see actions/receipts.ts). */
export function isVisionSupportedMimeType(mimeType: string): boolean {
    return mimeType === "image/jpeg" || mimeType === "image/jpg" || mimeType === "image/png" || mimeType === "image/webp";
}

/** Runs TEXT_DETECTION on an image buffer and returns the full extracted
 * text, or null if nothing was found, credentials are missing, or the
 * request failed for any reason (never throws — callers treat null as
 * "OCR unavailable right now", same as before this was wired up live). */
export async function runTextDetection(imageBuffer: Buffer): Promise<string | null> {
    const creds = getCredentials();
    if (!creds) return null;

    try {
        const accessToken = await getAccessToken(creds);
        const res = await fetch("https://vision.googleapis.com/v1/images:annotate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                requests: [
                    {
                        image: { content: imageBuffer.toString("base64") },
                        features: [{ type: "TEXT_DETECTION" }],
                    },
                ],
            }),
        });

        if (!res.ok) {
            console.error("Vision API request failed", res.status, await res.text());
            return null;
        }

        const data = await res.json();
        const annotation = data?.responses?.[0];
        if (annotation?.error) {
            console.error("Vision API returned an error", annotation.error);
            return null;
        }
        return annotation?.fullTextAnnotation?.text ?? annotation?.textAnnotations?.[0]?.description ?? null;
    } catch (err) {
        console.error("Vision text detection failed", err);
        return null;
    }
}
