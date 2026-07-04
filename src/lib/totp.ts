import QRCode from 'qrcode';

// Implementare TOTP (RFC 6238) nativa cu Web Crypto API — fara otplib
// Compatibila cu Google Authenticator, Authy, etc.

function base32Decode(input: string): Uint8Array {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const str = input.toUpperCase().replace(/=+$/, '');
    const bytes: number[] = [];
    let buffer = 0, bitsLeft = 0;
    for (const char of str) {
        const val = alphabet.indexOf(char);
        if (val < 0) continue;
        buffer = (buffer << 5) | val;
        bitsLeft += 5;
        if (bitsLeft >= 8) {
            bitsLeft -= 8;
            bytes.push((buffer >> bitsLeft) & 0xff);
        }
    }
    return new Uint8Array(bytes);
}

function base32Encode(bytes: Uint8Array): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let result = '';
    let buffer = 0, bitsLeft = 0;
    for (const byte of bytes) {
        buffer = (buffer << 8) | byte;
        bitsLeft += 8;
        while (bitsLeft >= 5) {
            bitsLeft -= 5;
            result += alphabet[(buffer >> bitsLeft) & 0x1f];
        }
    }
    if (bitsLeft > 0) result += alphabet[(buffer << (5 - bitsLeft)) & 0x1f];
    return result;
}

/** Copiază bytes într-un ArrayBuffer nou, cu tip garantat (evită union ArrayBuffer|SharedArrayBuffer) */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const buf = new ArrayBuffer(bytes.length);
    new Uint8Array(buf).set(bytes);
    return buf;
}

async function hotp(secret: Uint8Array, counter: bigint): Promise<number> {
    // Construiește 8-byte big-endian counter
    const counterBytes = new Uint8Array(8);
    let c = counter;
    for (let i = 7; i >= 0; i--) {
        counterBytes[i] = Number(c & 0xffn);
        c >>= 8n;
    }

    // HMAC-SHA1 cu Web Crypto API
    const key = await crypto.subtle.importKey(
        'raw',
        toArrayBuffer(secret),
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
    );

    const hmacResult = await crypto.subtle.sign(
        'HMAC',
        key,
        toArrayBuffer(counterBytes)
    );

    const sig = new Uint8Array(hmacResult);
    const offset = sig[19] & 0xf;
    const code = ((sig[offset] & 0x7f) << 24)
        | (sig[offset + 1] << 16)
        | (sig[offset + 2] << 8)
        | sig[offset + 3];
    return code % 1_000_000;
}

/** Genereaza un secret TOTP aleator (20 bytes, base32) */
export function generateTotpSecret(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    return base32Encode(bytes);
}

/** Genereaza QR code pentru Google Authenticator */
export async function generateQrCodeUrl(email: string, secret: string): Promise<string | null> {
    const issuer = 'BTC Manager';
    const otpauth = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    try {
        return await QRCode.toDataURL(otpauth);
    } catch (err) {
        console.error('QR Code generation failed', err);
        return null;
    }
}

/** Verifica un token TOTP (fereastra de ±1 pas = 90 secunde toleranta) */
export async function verifyTotpToken(token: string, secret: string): Promise<boolean> {
    try {
        const secretBytes = base32Decode(secret);
        const step = BigInt(Math.floor(Date.now() / 1000 / 30));
        for (const delta of [0n, -1n, 1n]) {
            const code = await hotp(secretBytes, step + delta);
            if (code === parseInt(token, 10)) return true;
        }
        return false;
    } catch {
        return false;
    }
}
