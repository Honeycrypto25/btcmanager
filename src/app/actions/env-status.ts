"use server";

import { requireAdmin } from "@/lib/permissions";

export interface EnvVarRow {
    key: string;
    description: string;
    required: boolean;
    set: boolean;
}

export interface EnvVarGroup {
    label: string;
    vars: EnvVarRow[];
}

/**
 * Static catalog of every environment variable this deployment reads (kept
 * in sync by hand — grep the codebase for `process.env.` if this list ever
 * looks stale). Grouped by feature area so /admin's "Variabile de mediu"
 * tab can double as a checklist when spinning up a similar deployment
 * elsewhere (a different DB, different bot wallets, etc.) — see each
 * group's own key names/descriptions rather than any actual secret value,
 * which this file/action never reads out loud to the client.
 *
 * `required: false` marks a var that has a safe fallback in code (an
 * optional API key, a default RPC endpoint, etc.) rather than one this
 * deployment can run without in practice — check the referenced file's own
 * comment if in doubt.
 */
const CATALOG: { label: string; vars: { key: string; description: string; required: boolean }[] }[] = [
    {
        label: "Bază de date & autentificare",
        vars: [
            { key: "DATABASE_URL", description: "Connection string Postgres (Neon) — Prisma citește/scrie tot din aici.", required: true },
            { key: "NEXTAUTH_SECRET", description: "Secret pentru semnarea sesiunilor NextAuth.", required: true },
            { key: "NEXTAUTH_URL", description: "URL-ul public al deployment-ului (folosit de NextAuth și în linkurile din emailuri).", required: true },
            { key: "ADMIN_EMAILS", description: "Listă de emailuri (separate prin virgulă) cu drepturi de admin.", required: true },
            { key: "CRON_SECRET", description: "Token verificat de fiecare rută /api/cron/* — Vercel îl trimite automat la joburile programate.", required: true },
        ],
    },
    {
        label: "Trading 212",
        vars: [
            { key: "T212_API_KEY", description: "Cheia API a contului Trading212.", required: false },
            { key: "T212_API_SECRET", description: "Secretul API al contului Trading212.", required: false },
            { key: "T212_ENVIRONMENT", description: "\"live\" sau \"demo\" — implicit \"live\" dacă lipsește.", required: false },
        ],
    },
    {
        label: "Solana (DCA + Eva)",
        vars: [
            { key: "SOLANA_PRIVATE_KEY", description: "Cheia privată a portofelului bot (SOL + EVA — același portofel pentru amândouă).", required: false },
            { key: "SOLANA_RPC_URL", description: "Endpoint RPC Solana folosit de bot.", required: false },
            { key: "SOLANA_SWEEP_DESTINATION", description: "Adresa cold-wallet unde se trimit retragerile lunare (SOL și EVA).", required: false },
            { key: "JUPITER_API_KEY", description: "Cheie API Jupiter — opțională, dar recomandată pentru rate-limit mai mari.", required: false },
        ],
    },
    {
        label: "Base (EVM DCA)",
        vars: [
            { key: "BASE_PRIVATE_KEY", description: "Cheia privată a portofelului bot EVM — reutilizată și de BNB și de Polygon (o cheie EVM merge pe orice chain compatibil).", required: false },
            { key: "BASE_RPC_URL", description: "Endpoint RPC Base folosit de bot.", required: false },
            { key: "BASE_SWEEP_DESTINATION", description: "Adresa cold-wallet pentru retragerile lunare de WETH.", required: false },
        ],
    },
    {
        label: "BNB Chain",
        vars: [
            { key: "BNB_RPC_URL", description: "Endpoint RPC BNB Chain folosit de bot.", required: false },
            { key: "BNB_SWEEP_DESTINATION", description: "Adresa cold-wallet pentru retragerile lunare de WBNB.", required: false },
        ],
    },
    {
        label: "Polygon (reverse-DCA)",
        vars: [
            { key: "POLYGON_RPC_URL", description: "Endpoint RPC Polygon — implicit polygon-rpc.com dacă lipsește.", required: false },
            { key: "POLYGON_SWEEP_DESTINATION", description: "Adresa cold-wallet pentru retragerile lunare de USDC.", required: false },
            { key: "ONEINCH_API_KEY", description: "Cheie API 1inch — necesară pentru swap-uri și ordinele limită de răscumpărare.", required: false },
        ],
    },
    {
        label: "Prețuri / date de piață",
        vars: [
            { key: "CMC_API_KEY", description: "Cheie API CoinMarketCap — sursă pentru prețuri.", required: false },
            { key: "COINGECKO_API_KEY", description: "Cheie API CoinGecko — sursă alternativă/suplimentară de prețuri.", required: false },
        ],
    },
    {
        label: "Email & rapoarte",
        vars: [
            { key: "RESEND_API_KEY", description: "Cheia API Resend — fără ea, rapoartele săptămânale/lunare nu se trimit.", required: false },
            { key: "EMAIL_FROM", description: "Adresa \"from\" pentru emailurile tranzacționale (notificări de tranzacții etc.).", required: false },
            { key: "REPORT_EMAIL_FROM", description: "Adresa \"from\" pentru rapoartele săptămânale/lunare — implicit reports@evama.net.", required: false },
            { key: "REPORT_EMAIL_TO", description: "Destinatarul rapoartelor săptămânale/lunare — fără ea, trimiterea eșuează.", required: false },
        ],
    },
    {
        label: "OCR chitanțe (Google Vision)",
        vars: [
            { key: "GOOGLE_VISION_CLIENT_EMAIL", description: "Email-ul contului de service Google Cloud Vision.", required: false },
            { key: "GOOGLE_VISION_PRIVATE_KEY", description: "Cheia privată a contului de service Google Cloud Vision.", required: false },
        ],
    },
    {
        label: "Stocare fișiere (Cloudflare R2)",
        vars: [
            { key: "R2_ACCOUNT_ID", description: "ID-ul contului Cloudflare.", required: false },
            { key: "R2_ACCESS_KEY_ID", description: "Access key R2 (compatibil S3).", required: false },
            { key: "R2_SECRET_ACCESS_KEY", description: "Secret key R2 (compatibil S3).", required: false },
            { key: "R2_BUCKET_NAME", description: "Numele bucket-ului R2 unde se urcă fișierele (chitanțe, documente etc.).", required: false },
        ],
    },
];

/**
 * Admin-only status check: for every env var this deployment reads,
 * whether it's currently SET — never the actual value, so this is safe to
 * show in the UI even though it's a full inventory of the deployment's
 * configuration surface.
 */
export async function getEnvVarStatus(): Promise<EnvVarGroup[]> {
    await requireAdmin();
    return CATALOG.map((group) => ({
        label: group.label,
        vars: group.vars.map((v) => ({
            ...v,
            set: !!process.env[v.key] && process.env[v.key] !== "",
        })),
    }));
}
