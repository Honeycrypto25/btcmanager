import { authenticator } from 'otplib';
import QRCode from 'qrcode';

/** Generate a new TOTP secret for a user */
export function generateTotpSecret(): string {
    return authenticator.generateSecret();
}

/** Generate a QR code URL for the TOTP secret */
export async function generateQrCodeUrl(email: string, secret: string): Promise<string | null> {
    const issuer = 'BTC Manager';
    const otpauth = authenticator.keyuri(email, issuer, secret);

    try {
        return await QRCode.toDataURL(otpauth);
    } catch (err) {
        console.error('QR Code generation failed', err);
        return null;
    }
}

/** Verify a TOTP token against a secret */
export function verifyTotpToken(token: string, secret: string): boolean {
    try {
        return authenticator.verify({ token, secret });
    } catch {
        return false;
    }
}
