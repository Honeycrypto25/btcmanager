import { Resend } from "resend";
import { getOverviewData, getRecentWindowStats } from "@/lib/overview-data";
import { buildReportHtml } from "@/lib/email/report-template";

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

function getDashboardUrl(): string {
    return process.env.NEXTAUTH_URL ?? "https://www.evama.net";
}

function monthLabel(date: Date): string {
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function weekRangeLabel(): string {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(start)} \u2013 ${fmt(end)}, ${end.getFullYear()}`;
}

export async function sendWeeklyReport(): Promise<{ ok: true } | { ok: false; error: string }> {
    const resend = getResendClient();
    if (!resend) return { ok: false, error: "RESEND_API_KEY is not set" };
    const to = getRecipient();
    if (!to) return { ok: false, error: "REPORT_EMAIL_TO is not set" };

    try {
        const { data } = await getOverviewData();
        const windowStats = await getRecentWindowStats(7);

        const html = buildReportHtml({
            periodType: "weekly",
            periodLabel: weekRangeLabel(),
            data,
            windowStats,
            dashboardUrl: getDashboardUrl(),
        });

        const result = await resend.emails.send({
            from: getSender(),
            to,
            subject: `Weekly portfolio report \u2014 ${data.totalPnl >= 0 ? '+' : ''}${data.pnlPercent.toFixed(1)}% overall`,
            html,
        });

        if (result.error) return { ok: false, error: result.error.message };
        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: err?.message ?? "Failed to send weekly report" };
    }
}

export async function sendMonthlyReport(): Promise<{ ok: true } | { ok: false; error: string }> {
    const resend = getResendClient();
    if (!resend) return { ok: false, error: "RESEND_API_KEY is not set" };
    const to = getRecipient();
    if (!to) return { ok: false, error: "REPORT_EMAIL_TO is not set" };

    try {
        const { data } = await getOverviewData();

        // Raportul lunar se trimite pe 1 — recapitulează luna tocmai încheiată,
        // adică primul rând din monthlyRows (cel mai recent).
        const lastMonthRow = data.monthlyRows[0];
        const lastMonthDate = new Date();
        lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);

        const windowStats = lastMonthRow
            ? {
                  btcInvested: lastMonthRow.btc.invested,
                  btcValue: lastMonthRow.btc.value,
                  t212Invested: lastMonthRow.t212.invested,
                  t212Value: lastMonthRow.t212.value,
                  invested: lastMonthRow.total.invested,
                  value: lastMonthRow.total.value,
              }
            : { btcInvested: 0, btcValue: 0, t212Invested: 0, t212Value: 0, invested: 0, value: 0 };

        const html = buildReportHtml({
            periodType: "monthly",
            periodLabel: monthLabel(lastMonthDate),
            data,
            windowStats,
            dashboardUrl: getDashboardUrl(),
        });

        const result = await resend.emails.send({
            from: getSender(),
            to,
            subject: `Monthly portfolio report \u2014 ${data.totalPnl >= 0 ? '+' : ''}${data.pnlPercent.toFixed(1)}% overall`,
            html,
        });

        if (result.error) return { ok: false, error: result.error.message };
        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: err?.message ?? "Failed to send monthly report" };
    }
}
