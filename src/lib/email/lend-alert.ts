import "server-only";
import { Resend } from "resend";
import { db } from "@/lib/db";
import type { LendPosition } from "@/lib/solana/jupiter-lend";

/**
 * Emails the owner each time a Jupiter Lend position's LTV climbs past a new step
 * (every 5 percentage points by default: 30%, 35%, 40% …), so a falling SOL price is noticed
 * before the position gets near liquidation. On by default; LEND_ALERT_EMAIL=0 turns it off.
 * LEND_ALERT_STEP changes the step (in percentage points).
 *
 * State: the last step already handled is kept per position. First run only records the
 * current step (no mail). Going up past it sends one mail; going down just lowers the marker,
 * so the same step mails again if the LTV climbs back. Safe to call as often as you like.
 * Not written to the email log (that table has a fixed list of types).
 */
export async function checkLendAlerts(
    positions: LendPosition[],
    capLtv: number
): Promise<{ ok: boolean; sent: number; reason?: string }> {
    if (process.env.LEND_ALERT_EMAIL === "0") return { ok: true, sent: 0, reason: "LEND_ALERT_EMAIL=0" };
    const stepRaw = Number(process.env.LEND_ALERT_STEP);
    const step = Number.isFinite(stepRaw) && stepRaw >= 1 ? Math.floor(stepRaw) : 5;

    let sent = 0;
    for (const p of positions) {
        try {
            const level = Math.floor((p.ltv * 100) / step) * step;
            const key = { owner_vaultId_nftId: { owner: p.owner, vaultId: p.vaultId, nftId: p.id } };
            const state = await db.lendAlertState.findUnique({ where: key });
            if (!state) {
                await db.lendAlertState.create({ data: { owner: p.owner, vaultId: p.vaultId, nftId: p.id, lastLevel: level } });
                continue;
            }
            if (level === state.lastLevel) continue;
            if (level < state.lastLevel) {
                await db.lendAlertState.update({ where: key, data: { lastLevel: level } });
                continue;
            }
            const res = await sendMail(p, level, capLtv);
            if (!res.ok) return { ok: false, sent, reason: res.reason };
            await db.lendAlertState.update({ where: key, data: { lastLevel: level } });
            sent++;
        } catch (err) {
            return { ok: false, sent, reason: (err as Error).message };
        }
    }
    return { ok: true, sent };
}

async function sendMail(p: LendPosition, level: number, capLtv: number): Promise<{ ok: boolean; reason?: string }> {
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.REPORT_EMAIL_TO;
    if (!apiKey) return { ok: false, reason: "RESEND_API_KEY is not set" };
    if (!to) return { ok: false, reason: "REPORT_EMAIL_TO is not set" };
    const from = process.env.REPORT_EMAIL_FROM ?? "Portfolio <reports@evama.net>";
    const sym = p.collateral.symbol;
    const lt = (p.liqThreshold ?? 0) * 100;
    const over = p.ltv >= capLtv;
    const subject = `LTV a trecut de ${level}% — Jupiter Lend ${sym}/${p.debt.symbol} #${p.id}`;
    const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#111">
<h2>LTV a trecut de ${level}%</h2>
<p>Poziția ${sym} / ${p.debt.symbol} #${p.id}: LTV <b>${(p.ltv * 100).toFixed(2)}%</b>${lt ? ` (lichidare la ${lt.toFixed(0)}%)` : ""}.</p>
<ul>
<li>${sym} acum: $${p.collateral.priceUsd.toFixed(2)}${p.liqPriceUsd != null ? ` · preț de lichidare: $${p.liqPriceUsd.toFixed(2)}` : ""}</li>
<li>Colateral: $${p.collateral.usd.toFixed(2)} · datorie: $${p.debt.usd.toFixed(2)}</li>
${over ? `<li><b>Ești peste plafonul tău de ${(capLtv * 100).toFixed(0)}%.</b> Nu mai împrumuta; adaugă colateral sau returnează din datorie.</li>` : `<li>Plafonul tău: ${(capLtv * 100).toFixed(0)}%.</li>`}
</ul>
<p>Detalii: Cold wallet → Împrumuturi. Vei primi următorul mail la următorul pas de LTV.</p></div>`;
    try {
        const res = await new Resend(apiKey).emails.send({ from, to, subject, html });
        return res.error ? { ok: false, reason: res.error.message } : { ok: true };
    } catch (err) {
        return { ok: false, reason: (err as Error).message };
    }
}
