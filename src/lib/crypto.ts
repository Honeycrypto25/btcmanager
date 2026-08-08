// Criptare simetrică (AES-256-GCM) pentru date sensibile stocate în DB —
// folosită pentru API key/secret-ul Trading212. Foloseste Web Crypto API,
// compatibilă atât cu Node.js cât și cu Edge Runtime.

const IV_LENGTH = 12; // bytes, standard pentru AES-GCM

function getEncryptionSecret(): string {
    const secret = process.env.CREDENTIALS_ENCRYPTION_KEY;
    if (!secret) throw new Error('CREDENTIALS_ENCRYPTION_KEY is not set');
    return secret;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
    // Derivăm o cheie AES-256 fixă din secretul de mediu (orice lungime) prin SHA-256
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', enc.encode(secret));
    return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/** Copiază bytes într-un ArrayBuffer nou, cu tip garantat (evită union ArrayBuffer|SharedArrayBuffer) */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const buf = new ArrayBuffer(bytes.length);
    new Uint8Array(buf).set(bytes);
    return buf;
}

/** Criptează un string în clar; rezultatul e "<iv-base64>.<ciphertext-base64>" */
export async function encryptSecret(plaintext: string): Promise<string> {
    const key = await deriveKey(getEncryptionSecret());
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoded = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

    return `${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

/** Decriptează un string produs de encryptSecret */
export async function decryptSecret(payload: string): Promise<string> {
    const [ivB64, ctB64] = payload.split('.');
    if (!ivB64 || !ctB64) throw new Error('Invalid encrypted payload format');

    const key = await deriveKey(getEncryptionSecret());
    const iv = fromBase64(ivB64);
    const ciphertext = fromBase64(ctB64);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(iv) },
        key,
        toArrayBuffer(ciphertext)
    );
    return new TextDecoder().decode(decrypted);
}

/** Afișează doar ultimele 4 caractere ale unui secret, pentru UI (ex: "••••3f9a") */
export function maskSecret(plaintext: string): string {
    if (plaintext.length <= 4) return '••••';
    return `••••${plaintext.slice(-4)}`;
}
