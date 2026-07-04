const COOKIE_NAME = '2fa_verified';

function getSecret(): string {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) throw new Error('NEXTAUTH_SECRET is not set');
    return secret;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    return crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
    );
}

function bufToHex(buf: ArrayBuffer): string {
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/** Creează un payload semnat HMAC-SHA256: "<userId>.<timestamp>.<signature>" */
export async function sign2faCookie(userId: string): Promise<string> {
    const timestamp = Date.now().toString();
    const payload = `${userId}.${timestamp}`;
    const key = await getHmacKey(getSecret());
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    return `${payload}.${bufToHex(sig)}`;
}

/** Verifică semnătura și returnează userId dacă e valid, null altfel */
export async function verify2faCookie(value: string, maxAgeSeconds = 86400): Promise<string | null> {
    try {
        const lastDot = value.lastIndexOf('.');
        const secondLastDot = value.lastIndexOf('.', lastDot - 1);
        if (lastDot === -1 || secondLastDot === -1) return null;

        const payload = value.substring(0, lastDot);
        const sig = value.substring(lastDot + 1);
        const userId = value.substring(0, secondLastDot);
        const timestamp = value.substring(secondLastDot + 1, lastDot);

        const key = await getHmacKey(getSecret());
        const sigBytes = Uint8Array.from(sig.match(/.{2}/g)!.map(b => parseInt(b, 16)));
        const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payload));
        if (!valid) return null;

        const age = (Date.now() - parseInt(timestamp, 10)) / 1000;
        if (age > maxAgeSeconds) return null;

        return userId;
    } catch {
        return null;
    }
}

export { COOKIE_NAME };
