import "server-only";
import { Resend } from "resend";
import { logEmail, type EmailType } from "./email-log";

function getResendClient(): Resend | null {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return null;
    return new Resend(apiKey);
}

function getRecipient(): string | null {
    return process.env.REPORT_EMAIL_TO ?? null;
}

function getSender(): string {
    // Trebuie să fie o adresă pe un domeniu verificat în Resend.
    return process.env.REPORT_EMAIL_FROM ?? "Portfolio <reports@evama.net>";
}

const COLORS = {
    bg: '#0a0a09',
    card: '#131311',
    cardBorder: '#26241f',
    foreground: '#f5f4f0',
    muted: '#a8a6a0',
    faint: '#6b6963',
    accent: '#52c98a',
    accentSoft: 'rgba(82,201,138,0.12)',
    red: '#e5605a',
    redSoft: 'rgba(229,96,90,0.12)',
    solana: '#9945FF',
    solanaSoft: 'rgba(153,69,255,0.12)',
    base: '#0052FF',
    baseSoft: 'rgba(0,82,255,0.12)',
    bnb: '#F0B90B',
    bnbSoft: 'rgba(240,185,11,0.12)',
};

const FONT_DISPLAY = "'Space Grotesk', Helvetica, Arial, sans-serif";
const FONT_BODY = "Helvetica, Arial, sans-serif";

export type ChainName = "Solana" | "Base (ETH)" | "BNB Chain";

const CHAIN_COLOR: Record<ChainName, { fg: string; soft: string }> = {
    "Solana": { fg: COLORS.solana, soft: COLORS.solanaSoft },
    "Base (ETH)": { fg: COLORS.base, soft: COLORS.baseSoft },
    "BNB Chain": { fg: COLORS.bnb, soft: COLORS.bnbSoft },
};

function fmtUsd(n: number): string {
    const sign = n < 0 ? '-' : '';
    return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtToken(n: number): string {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 });
}

interface Row {
    label: string;
    value: string;
    valueColor?: string;
}

/**
 * Compact, single-purpose transaction email — deliberately much smaller
 * than the weekly/monthly report (buildReportHtml in report-template.ts),
 * since this fires per-event rather than as a digest. Reuses the same
 * color tokens/fonts for visual consistency with the report emails.
 */
function buildEmailHtml(opts: {
    chain: ChainName;
    badge: string;
    badgeColor: string;
    title: string;
    rows: Row[];
    link?: { label: string; url: string };
    dashboardUrl: string;
}): string {
    const chainColor = CHAIN_COLOR[opts.chain];
    const rowsHtml = opts.rows
        .map(
            (r) => `
        <tr>
          <td style="padding:9px 0;border-top:1px solid ${COLORS.cardBorder};font-family:${FONT_BODY};font-size:13px;color:${COLORS.faint};">${r.label}</td>
          <td style="padding:9px 0;border-top:1px solid ${COLORS.cardBorder};font-family:${FONT_BODY};font-size:13px;color:${r.valueColor ?? COLORS.foreground};text-align:right;font-weight:600;">${r.value}</td>
        </tr>`
        )
        .join("");

    const linkHtml = opts.link
        ? `<p style="margin:16px 0 0;font-family:${FONT_BODY};font-size:12px;">
             <a href="${opts.link.url}" style="color:${chainColor.fg};text-decoration:underline;">${opts.link.label} ↗</a>
           </p>`
        : "";

    return `
<div style="background:${COLORS.bg};padding:32px 16px;">
  <div style="max-width:480px;margin:0 auto;background:${COLORS.card};border:1px solid ${COLORS.cardBorder};border-radius:16px;padding:28px;">
    <span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${chainColor.soft};color:${chainColor.fg};font-family:${FONT_BODY};font-size:11px;font-weight:600;letter-spacing:0.02em;">${opts.chain}</span>
    <span style="display:inline-block;margin-left:6px;padding:3px 10px;border-radius:999px;background:${opts.badgeColor === COLORS.accent ? COLORS.accentSoft : opts.badgeColor === COLORS.red ? COLORS.redSoft : 'rgba(255,255,255,0.06)'};color:${opts.badgeColor};font-family:${FONT_BODY};font-size:11px;font-weight:600;letter-spacing:0.02em;">${opts.badge}</span>
    <h1 style="margin:14px 0 4px;font-family:${FONT_DISPLAY};font-size:18px;font-weight:500;color:${COLORS.foreground};">${opts.title}</h1>
    <table style="width:100%;border-collapse:collapse;margin-top:8px;">
      ${rowsHtml}
    </table>
    ${linkHtml}
    <p style="margin:20px 0 0;font-family:${FONT_BODY};font-size:11px;color:${COLORS.faint};">
      <a href="${opts.dashboardUrl}" style="color:${COLORS.faint};text-decoration:underline;">Deschide dashboard-ul</a>
    </p>
  </div>
</div>`;
}

/**
 * Fire-and-forget send — NEVER throws. This is called from deep inside
 * the trading logic (dca.ts / sweep.ts on all three chains); a Resend
 * outage or a missing API key must never break a real buy/sell/sweep, so
 * every failure is swallowed here and only logged. Every real attempt
 * (RESEND_API_KEY + REPORT_EMAIL_TO both configured) is recorded via
 * logEmail() for the Admin > "Emailuri" history tab — a skip due to
 * missing config isn't logged, since nothing was actually attempted.
 */
async function send(type: EmailType, chain: ChainName, subject: string, html: string): Promise<void> {
    try {
        const resend = getResendClient();
        if (!resend) return;
        const to = getRecipient();
        if (!to) return;
        const result = await resend.emails.send({ from: getSender(), to, subject, html });
        if (result.error) {
            console.error("Transaction notification email failed to send:", result.error.message);
            await logEmail({ type, chain, subject, recipient: to, status: "FAILED", errorMessage: result.error.message });
        } else {
            await logEmail({ type, chain, subject, recipient: to, status: "SENT" });
        }
    } catch (err) {
        console.error("Transaction notification email threw:", err);
        const to = getRecipient();
        if (to) {
            await logEmail({ type, chain, subject, recipient: to, status: "FAILED", errorMessage: err instanceof Error ? err.message : String(err) });
        }
    }
}

function getDashboardUrl(): string {
    return process.env.NEXTAUTH_URL ?? "https://www.evama.net";
}

/** Sent once a DCA cycle's buy AND its take-profit sell order are both confirmed — not on the bare buy alone. */
export async function notifyOrderPlaced(opts: {
    chain: ChainName;
    tokenSymbol: string;
    buyAmountUsd: number;
    tokenAcquired: number;
    buyPriceUsd: number;
    targetPriceUsd: number;
    takeProfitPercent: number;
    sellAmountPlanned: number;
    buyTxUrl?: string;
}): Promise<void> {
    const rows: Row[] = [
        { label: "Sumă cumpărată", value: fmtUsd(opts.buyAmountUsd) },
        { label: `${opts.tokenSymbol} primit`, value: `${fmtToken(opts.tokenAcquired)} ${opts.tokenSymbol}` },
        { label: "Preț cumpărare", value: fmtUsd(opts.buyPriceUsd) },
        { label: "Preț țintă vânzare", value: `${fmtUsd(opts.targetPriceUsd)} (+${opts.takeProfitPercent}%)` },
        { label: `${opts.tokenSymbol} la vânzare`, value: `${fmtToken(opts.sellAmountPlanned)} ${opts.tokenSymbol}` },
    ];
    const html = buildEmailHtml({
        chain: opts.chain,
        badge: "Ordin plasat",
        badgeColor: COLORS.foreground,
        title: `Cumpărare + ordin de vânzare plasat`,
        rows,
        link: opts.buyTxUrl ? { label: "Vezi tranzacția de cumpărare", url: opts.buyTxUrl } : undefined,
        dashboardUrl: getDashboardUrl(),
    });
    await send("ORDER_PLACED", opts.chain, `${opts.chain} DCA — ordin plasat (${fmtUsd(opts.buyAmountUsd)})`, html);
}

/** Sent when a previously-open take-profit order is detected as FILLED (via cron reconcile or manual "Verifică acum"). */
export async function notifyOrderFilled(opts: {
    chain: ChainName;
    tokenSymbol: string;
    tokenSold: number;
    sellProceedsUsd: number;
    realizedPnlUsd: number;
    sellFeeUsd: number;
    sellTxUrl?: string;
}): Promise<void> {
    const pnlColor = opts.realizedPnlUsd >= 0 ? COLORS.accent : COLORS.red;
    const sellPriceUsd = opts.tokenSold > 0 ? opts.sellProceedsUsd / opts.tokenSold : 0;
    const rows: Row[] = [
        { label: `${opts.tokenSymbol} vândut`, value: `${fmtToken(opts.tokenSold)} ${opts.tokenSymbol}` },
        { label: "Preț vânzare", value: fmtUsd(sellPriceUsd) },
        { label: "Încasat", value: fmtUsd(opts.sellProceedsUsd) },
        { label: "P&L realizat", value: fmtUsd(opts.realizedPnlUsd), valueColor: pnlColor },
    ];
    const html = buildEmailHtml({
        chain: opts.chain,
        badge: "Vândut",
        badgeColor: COLORS.accent,
        title: `Ordin de vânzare finalizat`,
        rows,
        link: opts.sellTxUrl ? { label: "Vezi tranzacția de vânzare", url: opts.sellTxUrl } : undefined,
        dashboardUrl: getDashboardUrl(),
    });
    await send("ORDER_FILLED", opts.chain, `${opts.chain} DCA — vândut (${opts.realizedPnlUsd >= 0 ? '+' : ''}${fmtUsd(opts.realizedPnlUsd)} P&L)`, html);
}

/** Sent for every actual sweep attempt (success or failure) — not for routine "not due yet" / "nothing to send" skips. */
export async function notifySweep(opts: {
    chain: ChainName;
    tokenSymbol: string;
    status: "SUCCESS" | "FAILED";
    amount: number;
    destination: string;
    manual: boolean;
    txUrl?: string;
    errorMessage?: string;
}): Promise<void> {
    const rows: Row[] = [
        { label: "Sumă retrasă", value: `${fmtToken(opts.amount)} ${opts.tokenSymbol}` },
        { label: "Către", value: `${opts.destination.slice(0, 6)}...${opts.destination.slice(-4)}` },
        { label: "Declanșat", value: opts.manual ? "manual (Trimite acum)" : "automat (lunar)" },
    ];
    if (opts.status === "FAILED" && opts.errorMessage) {
        rows.push({ label: "Eroare", value: opts.errorMessage, valueColor: COLORS.red });
    }
    const html = buildEmailHtml({
        chain: opts.chain,
        badge: opts.status === "SUCCESS" ? "Retragere reușită" : "Retragere eșuată",
        badgeColor: opts.status === "SUCCESS" ? COLORS.accent : COLORS.red,
        title: opts.status === "SUCCESS" ? `Retragere lunară efectuată` : `Retragere lunară eșuată`,
        rows,
        link: opts.txUrl ? { label: "Vezi tranzacția", url: opts.txUrl } : undefined,
        dashboardUrl: getDashboardUrl(),
    });
    const subjectPrefix = opts.status === "SUCCESS" ? "retragere reușită" : "retragere EȘUATĂ";
    await send("SWEEP", opts.chain, `${opts.chain} — ${subjectPrefix} (${fmtToken(opts.amount)} ${opts.tokenSymbol})`, html);
}
