// Node-runtime helpers for the "safe devices" feature — DB-backed, so these
// must never be imported from src/proxy.ts (edge middleware). The edge-safe
// signature check alone lives in src/lib/cookie-sign.ts
// (verifyTrustedDeviceCookie); this file adds the DB round-trip on top,
// which is what makes a device's trust revocable from Admin.
import { db } from "./db";
import {
    signTrustedDeviceCookie,
    verifyTrustedDeviceCookie,
    TRUSTED_DEVICE_COOKIE,
    TRUSTED_DEVICE_MAX_AGE_SECONDS,
} from "./cookie-sign";

export { TRUSTED_DEVICE_COOKIE, TRUSTED_DEVICE_MAX_AGE_SECONDS };

/** Best-effort human label from a User-Agent string, e.g. "Chrome on macOS". */
export function labelFromUserAgent(ua: string | null | undefined): string | null {
    if (!ua) return null;
    const browser =
        /Edg\//.test(ua) ? "Edge" :
        /OPR\//.test(ua) ? "Opera" :
        /Chrome\//.test(ua) ? "Chrome" :
        /Firefox\//.test(ua) ? "Firefox" :
        /Safari\//.test(ua) ? "Safari" :
        "Browser";
    const os =
        /iPhone|iPad/.test(ua) ? "iOS" :
        /Mac OS X/.test(ua) ? "macOS" :
        /Windows/.test(ua) ? "Windows" :
        /Android/.test(ua) ? "Android" :
        /Linux/.test(ua) ? "Linux" :
        "";
    return os ? `${browser} on ${os}` : browser;
}

/**
 * Creates a new TrustedDevice row for this user and returns the signed
 * cookie value to set. Only ever called right after a FULL verified login
 * (OTP + TOTP, for accounts with 2FA on) — never earlier — so a compromised
 * OTP email alone can't grant lasting trust.
 */
export async function createTrustedDevice(userId: string, userAgent: string | null): Promise<string> {
    const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_MAX_AGE_SECONDS * 1000);
    const device = await db.trustedDevice.create({
        data: { userId, userAgent, label: labelFromUserAgent(userAgent), expiresAt },
    });
    return signTrustedDeviceCookie(userId, device.id);
}

/**
 * Verifies a trusted_device cookie value against the DB — signature valid,
 * row still exists (not revoked from Admin) and not expired. Bumps
 * lastUsedAt on success (fire-and-forget). Returns the userId the device is
 * trusted for, or null.
 */
export async function verifyTrustedDevice(cookieValue: string | undefined | null): Promise<string | null> {
    if (!cookieValue) return null;
    const parsed = await verifyTrustedDeviceCookie(cookieValue);
    if (!parsed) return null;

    const device = await db.trustedDevice.findUnique({ where: { id: parsed.deviceId } });
    if (!device || device.userId !== parsed.userId) return null;
    if (device.expiresAt.getTime() < Date.now()) return null;

    db.trustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return device.userId;
}

/** Extracts a single cookie value from a raw `Cookie` header string. */
export function readCookieFromHeader(cookieHeader: string | null | undefined, name: string): string | null {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        const key = part.slice(0, idx).trim();
        if (key === name) return decodeURIComponent(part.slice(idx + 1).trim());
    }
    return null;
}
