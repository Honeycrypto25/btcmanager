// Workaround for otplib build issues in this environment
// We import exactly what the build system suggests or knows is there.
import {
    // @ts-ignore
    generateSecret,
    // @ts-ignore
    verify
} from 'otplib';
import QRCode from 'qrcode';

/** Generate a new TOTP secret for a user */
export function generateTotpSecret(): string {
    return generateSecret();
}

/** Generate a QR code URL for the TOTP secret */
export async function generateQrCodeUrl(email: string, secret: string): Promise<string | null> {
    const issuer = 'BTC Manager';
    // Manual otpauth URI generation to avoid missing 'keyuri' export issue
    const otpauth = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;

    try {
        return await QRCode.toDataURL(otpauth);
    } catch (err) {
        console.error('QR Code generation failed', err);
        return null;
    }
}

/** Verify a TOTP token against a secret */
export async function verifyTotpToken(token: string, secret: string): Promise<boolean> {
    try {
        const result = await verify({ token, secret });
        return result && result.valid === true;
    } catch (err) {
        return false;
    }
}
