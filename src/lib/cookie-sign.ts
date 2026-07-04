import crypto from 'crypto';

const COOKIE_NAME = '2fa_verified';

function getSecret(): string {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) throw new Error('NEXTAUTH_SECRET is not set');
    return secret;
}

/** Creează un payload semnat HMAC-SHA256: "<userId>.<timestamp>.<signature>" */
export function sign2faCookie(userId: string): string {
    const timestamp = Date.now().toString();
    const payload = `${userId}.${timestamp}`;
    const sig = crypto
        .createHmac('sha256', getSecret())
        .update(payload)
        .digest('hex');
    return `${payload}.${sig}`;
}

/** Verifică semnătura și returnează userId dacă e valid, null altfel */
export function verify2faCookie(value: string, maxAgeSeconds = 86400): string | null {
    try {
        const parts = value.split('.');
        if (parts.length !== 3) return null;

        const [userId, timestamp, sig] = parts;
        const payload = `${userId}.${timestamp}`;

        const expected = crypto
            .createHmac('sha256', getSecret())
            .update(payload)
            .digest('hex');

        // Comparare în timp constant pentru a preveni timing attacks
        if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
            return null;
        }

        // Verifică expirarea
        const age = (Date.now() - parseInt(timestamp, 10)) / 1000;
        if (age > maxAgeSeconds) return null;

        return userId;
    } catch {
        return null;
    }
}

export { COOKIE_NAME };
