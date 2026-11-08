/** Own LTV ceiling for new borrowing: LEND_MAX_LTV in Vercel, "30" or "0.3". Defaults to 30%. */
export function lendCapLtv(): number {
    const raw = Number(process.env.LEND_MAX_LTV);
    if (!Number.isFinite(raw) || raw <= 0) return 0.3;
    return raw > 1 ? Math.min(raw / 100, 0.95) : Math.min(raw, 0.95);
}
