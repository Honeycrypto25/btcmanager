import { Resend } from "resend";
import { getOverviewData, getCalendarWeekStats, getCalendarMonthStats } from "@/lib/overview-data";
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

function rangeLabel(start: Date, end: Date): string {
    // end e exclusiv (începutul următoarei perioade) — afișăm ultima zi reală inclusă.
    const lastDay = new Date(end.getTime() - 1);
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(start)} \u2013 ${fmt(lastDay)}, ${lastDay.getFullYear()}`;
}

export async function sendWeeklyReport(): Promise<{ ok: true } | { ok: false; error: string }> {
    const resend = getResendClient();
    if (!resend) return { ok: false, error: "RESEND_API_KEY is not set" };
    const to = getRecipient();
    if (!to) return { ok: false, error: "REPORT_EMAIL_TO is not set" };

    try {
        const { data } = await getOverviewData();
        // Săptămâna calendaristică ÎNCHEIATĂ cel mai recent (luni-duminică),
        // nu ultimele 7 zile de la momentul rulării.
        const { start, end, ...windowStats } = await getCalendarWeekStats(1);

        const html = buildReportHtml({
            periodType: "weekly",
            periodLabel: rangeLabel(start, end),
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
        // Luna calendaristică ÎNCHEIATĂ cel mai recent, cu limite explicite —
        // nu "primul rând din monthlyRows" (fragil dacă sync-ul de dimineață
        // prinde deja o tranzacție din ziua 1 a lunii noi, înainte ca
        // raportul, tot pe ziua 1, să ruleze).
        const { start, ...windowStats } = await getCalendarMonthStats(1);

        const html = buildReportHtml({
            periodType: "monthly",
            periodLabel: monthLabel(start),
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
