import crypto from 'crypto';

export function generateToken(length = 6): string {
    if (length <= 0) return '';

    // Generate random bytes and convert to a number string
    const max = Math.pow(10, length);
    const min = Math.pow(10, length - 1);

    const randomValue = crypto.randomInt(min, max);
    return randomValue.toString();
}
