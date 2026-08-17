import type { OverviewData, PeriodRow } from "@/components/overview/OverviewClient";
import type { AssetEvolution } from "@/lib/overview-evolution";

interface WindowStats {
    btcInvested: number;
    btcValue: number;
    t212Invested: number;
    t212Value: number;
    invested: number;
    value: number;
}

const COLORS = {
    bg: '#0a0a09',
    card: '#131311',
    cardBorder: '#26241f',
    foreground: '#f5f4f0',
    muted: '#a8a6a0',
    faint: '#6b6963',
    primary: '#d6a24c',
    primarySoft: 'rgba(214,162,76,0.12)',
    accent: '#52c98a',
    accentSoft: 'rgba(82,201,138,0.12)',
    red: '#e5605a',
    redSoft: 'rgba(229,96,90,0.12)',
    t212: '#7c93b8',
    t212Soft: 'rgba(124,147,184,0.12)',
};

const FONT_DISPLAY = "'Space Grotesk', Helvetica, Arial, sans-serif";
const FONT_MONO = "'JetBrains Mono', 'Courier New', Courier, monospace";
const FONT_BODY = "Helvetica, Arial, sans-serif";

function fmt(n: number): string {
    const sign = n < 0 ? '-' : '';
    return `${sign}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 })}`;
}

function pct(n: number): string {
    return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function pnlColor(n: number): string {
    return n >= 0 ? COLORS.accent : COLORS.red;
}

function pnlSoft(n: number): string {
    return n >= 0 ? COLORS.accentSoft : COLORS.redSoft;
}

function pnlSoftFromHex(hex: string): string {
    return hex === COLORS.accent ? COLORS.accentSoft : COLORS.redSoft;
}

/** "30d +2.1% \u00b7 6mo \u2014 \u00b7 1y \u2014" — same 30-day/6-month/1-year
 * value-evolution reading shown on the dashboard cards (see
 * lib/overview-evolution.ts). Dashes mean not enough history yet for that
 * window, not a 0% change. */
function evoText(evo?: AssetEvolution | null): string {
    if (!evo) return '';
    const one = (n: number | null) => (n === null ? '\u2014' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`);
    return `30d ${one(evo.d30)} &middot; 6mo ${one(evo.m6)} &middot; 1y ${one(evo.y1)}`;
}

function statPill(label: string, value: string, color: string): string {
    return `
    <td style="padding: 0 6px;" valign="top">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.card}; border:1px solid ${COLORS.cardBorder}; border-radius:12px;">
        <tr><td style="padding:16px 14px;">
          <div style="font-family:${FONT_BODY}; font-size:10px; letter-spacing:0.08em; text-transform:uppercase; color:${COLORS.faint}; margin-bottom:8px;">${label}</div>
          <div style="font-family:${FONT_MONO}; font-size:20px; font-weight:600; color:${color};">${value}</div>
        </td></tr>
      </table>
    </td>`;
}

function assetCard(opts: {
    name: string;
    accentColor: string;
    investedLabel: string;
    investedValue: string;
    valueLabel: string;
    currentValue: string;
    pnlText: string;
    pnlPercentText: string;
    pnlHex: string;
    extraLine?: string;
}): string {
    return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.card}; border:1px solid ${COLORS.cardBorder}; border-radius:14px; margin-bottom:14px;">
    <tr>
      <td style="padding:20px 22px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <div style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:${opts.accentColor}; margin-right:8px;"></div>
              <span style="font-family:${FONT_DISPLAY}; font-size:15px; font-weight:600; color:${COLORS.foreground}; vertical-align:middle;">${opts.name}</span>
            </td>
            <td align="right">
              <span style="font-family:${FONT_MONO}; font-size:13px; font-weight:600; padding:4px 10px; border-radius:20px; background-color:${pnlSoftFromHex(opts.pnlHex)}; color:${opts.pnlHex};">${opts.pnlPercentText}</span>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">
          <tr>
            <td width="50%" style="padding-right:8px;">
              <div style="font-family:${FONT_BODY}; font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:${COLORS.faint}; margin-bottom:4px;">${opts.investedLabel}</div>
              <div style="font-family:${FONT_MONO}; font-size:17px; color:${COLORS.foreground};">${opts.investedValue}</div>
            </td>
            <td width="50%" style="padding-left:8px;">
              <div style="font-family:${FONT_BODY}; font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:${COLORS.faint}; margin-bottom:4px;">${opts.valueLabel}</div>
              <div style="font-family:${FONT_MONO}; font-size:17px; color:${COLORS.foreground};">${opts.currentValue}</div>
            </td>
          </tr>
        </table>
        <div style="font-family:${FONT_MONO}; font-size:12px; color:${opts.pnlHex}; margin-top:10px;">${opts.pnlText}</div>
        ${opts.extraLine ? `<div style="font-family:${FONT_BODY}; font-size:11px; color:${COLORS.faint}; margin-top:8px; padding-top:8px; border-top:1px solid ${COLORS.cardBorder};">${opts.extraLine}</div>` : ''}
      </td>
    </tr>
  </table>`;
}

function monthsTable(rows: PeriodRow[]): string {
    const recent = rows.slice(0, 6);
    if (recent.length === 0) return '';

    const lines = recent.map((r) => `
    <tr>
      <td style="padding:9px 0; border-bottom:1px solid ${COLORS.cardBorder}; font-family:${FONT_BODY}; font-size:12px; color:${COLORS.foreground};">${r.label}</td>
      <td align="right" style="padding:9px 0; border-bottom:1px solid ${COLORS.cardBorder}; font-family:${FONT_MONO}; font-size:12px; color:${COLORS.muted};">${r.total.invested !== 0 ? fmt(r.total.invested) : '\u2014'}</td>
      <td align="right" style="padding:9px 0; border-bottom:1px solid ${COLORS.cardBorder}; font-family:${FONT_MONO}; font-size:12px; color:${COLORS.foreground};">${fmt(r.total.value)}</td>
      <td align="right" style="padding:9px 0; border-bottom:1px solid ${COLORS.cardBorder}; font-family:${FONT_MONO}; font-size:12px; color:${r.total.invested !== 0 ? pnlColor(r.total.pnlPercent) : COLORS.faint};">${r.total.invested !== 0 ? pct(r.total.pnlPercent) : '\u2014'}</td>
    </tr>`).join('');

    return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.card}; border:1px solid ${COLORS.cardBorder}; border-radius:14px; margin-bottom:14px;">
    <tr><td style="padding:20px 22px;">
      <div style="font-family:${FONT_DISPLAY}; font-size:15px; font-weight:600; color:${COLORS.foreground}; margin-bottom:14px;">Recent months</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-family:${FONT_BODY}; font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:${COLORS.faint}; padding-bottom:8px;">Month</td>
          <td align="right" style="font-family:${FONT_BODY}; font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:${COLORS.faint}; padding-bottom:8px;">Invested</td>
          <td align="right" style="font-family:${FONT_BODY}; font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:${COLORS.faint}; padding-bottom:8px;">Value</td>
          <td align="right" style="font-family:${FONT_BODY}; font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:${COLORS.faint}; padding-bottom:8px;">Return</td>
        </tr>
        ${lines}
      </table>
    </td></tr>
  </table>`;
}

export interface ReportVanguardTotals {
    invested: number;
    value: number;
    pnl: number;
    pnlPercent: number;
    accountCount: number;
}

export function buildReportHtml(opts: {
    periodType: 'weekly' | 'monthly';
    periodLabel: string;
    data: OverviewData;
    windowStats: WindowStats;
    dashboardUrl: string;
    /** USD-converted, same base as data.total* — combined into the hero
     * total/stat pills below (unlike windowStats, which stays BTC/T212
     * only: Vanguard has no dated contribution log, so there's no "this
     * week/month" figure to show for it — see lib/overview-evolution.ts). */
    vanguard?: ReportVanguardTotals | null;
    evolution?: { btc: AssetEvolution; t212: AssetEvolution; vanguard: AssetEvolution } | null;
}): string {
    const { periodType, periodLabel, data, windowStats, dashboardUrl, vanguard, evolution } = opts;
    const badge = periodType === 'weekly' ? 'WEEKLY REPORT' : 'MONTHLY REPORT';
    const windowLabel = periodType === 'weekly' ? 'This week' : 'Last month';

    // Combined hero/pill totals — BTC + T212 (data.total*) + Vanguard, same
    // "invested-vs-current-value assets are directly comparable" reasoning
    // the dashboard's Overview page already uses (see OverviewClient.tsx).
    const combinedInvested = data.totalInvested + (vanguard?.invested ?? 0);
    const combinedValue = data.totalValue + (vanguard?.value ?? 0);
    const combinedPnl = data.totalPnl + (vanguard?.pnl ?? 0);
    const combinedPnlPercent = combinedInvested > 0 ? (combinedPnl / combinedInvested) * 100 : 0;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Portfolio ${badge}</title>
</head>
<body style="margin:0; padding:0; background-color:${COLORS.bg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.bg};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">

        <!-- Header -->
        <tr>
          <td style="padding-bottom:28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="font-family:${FONT_DISPLAY}; font-size:20px; font-weight:600; color:${COLORS.foreground};">Portfolio</span>
                </td>
                <td align="right">
                  <span style="font-family:${FONT_BODY}; font-size:10px; letter-spacing:0.1em; color:${COLORS.primary}; background-color:${COLORS.primarySoft}; padding:6px 12px; border-radius:20px;">${badge}</span>
                </td>
              </tr>
            </table>
            <div style="font-family:${FONT_BODY}; font-size:13px; color:${COLORS.faint}; margin-top:6px;">${periodLabel}</div>
          </td>
        </tr>

        <!-- Hero: total value -->
        <tr>
          <td style="padding-bottom:20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.card}; border:1px solid ${COLORS.cardBorder}; border-radius:16px;">
              <tr>
                <td style="padding:26px 24px;">
                  <div style="font-family:${FONT_BODY}; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:${COLORS.faint}; margin-bottom:10px;">Total portfolio value</div>
                  <div style="font-family:${FONT_MONO}; font-size:38px; font-weight:600; color:${COLORS.foreground}; line-height:1;">${fmt(combinedValue)}</div>
                  <div style="margin-top:12px;">
                    <span style="font-family:${FONT_MONO}; font-size:13px; font-weight:600; color:${pnlColor(combinedPnl)}; background-color:${pnlSoft(combinedPnl)}; padding:5px 12px; border-radius:20px;">
                      ${combinedPnl >= 0 ? '+' : ''}${fmt(combinedPnl)} (${pct(combinedPnlPercent)})
                    </span>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Stat pills -->
        <tr>
          <td style="padding-bottom:20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                ${statPill('Total invested', fmt(combinedInvested), COLORS.foreground)}
                ${statPill('Unrealized P&L', `${combinedPnl >= 0 ? '+' : ''}${fmt(combinedPnl)}`, pnlColor(combinedPnl))}
                ${statPill('ROI', pct(combinedPnlPercent), pnlColor(combinedPnlPercent))}
              </tr>
            </table>
          </td>
        </tr>

        <!-- This period box -->
        <tr>
          <td style="padding-bottom:20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.primarySoft}; border:1px solid rgba(214,162,76,0.25); border-radius:14px;">
              <tr>
                <td style="padding:20px 22px;">
                  <div style="font-family:${FONT_DISPLAY}; font-size:14px; font-weight:600; color:${COLORS.primary}; margin-bottom:12px;">${windowLabel}</div>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="50%">
                        <div style="font-family:${FONT_BODY}; font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:${COLORS.faint}; margin-bottom:4px;">Invested</div>
                        <div style="font-family:${FONT_MONO}; font-size:19px; color:${COLORS.foreground};">${fmt(windowStats.invested)}</div>
                      </td>
                      <td width="50%">
                        <div style="font-family:${FONT_BODY}; font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:${COLORS.faint}; margin-bottom:4px;">Value today</div>
                        <div style="font-family:${FONT_MONO}; font-size:19px; color:${COLORS.foreground};">${fmt(windowStats.value)}</div>
                      </td>
                    </tr>
                  </table>
                  <div style="font-family:${FONT_BODY}; font-size:11px; color:${COLORS.faint}; margin-top:12px; padding-top:12px; border-top:1px solid rgba(214,162,76,0.2);">
                    BTC: ${fmt(windowStats.btcInvested)} invested &middot; T212: ${fmt(windowStats.t212Invested)} invested
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Per-asset cards -->
        <tr>
          <td style="padding-bottom:2px;">
            ${assetCard({
                name: 'Bitcoin',
                accentColor: COLORS.primary,
                investedLabel: 'Invested',
                investedValue: fmt(data.btc.invested),
                valueLabel: 'Current value',
                currentValue: fmt(data.btc.value),
                pnlText: `${data.btc.pnl >= 0 ? '+' : ''}${fmt(data.btc.pnl)}`,
                pnlPercentText: pct(data.btc.pnlPercent),
                pnlHex: pnlColor(data.btc.pnlPercent),
                extraLine: [`${data.btc.amount.toFixed(6)} BTC held`, evoText(evolution?.btc)].filter(Boolean).join('<br/>'),
            })}
            ${data.t212.connected ? assetCard({
                name: 'Trading 212',
                accentColor: COLORS.t212,
                investedLabel: 'Invested',
                investedValue: fmt(data.t212.invested),
                valueLabel: 'Current value',
                currentValue: fmt(data.t212.value),
                pnlText: `${data.t212.pnl >= 0 ? '+' : ''}${fmt(data.t212.pnl)}`,
                pnlPercentText: pct(data.t212.pnlPercent),
                pnlHex: pnlColor(data.t212.pnlPercent),
                extraLine: evoText(evolution?.t212) || undefined,
            }) : ''}
            ${vanguard && vanguard.accountCount > 0 ? assetCard({
                name: `Vanguard (${vanguard.accountCount} account${vanguard.accountCount === 1 ? '' : 's'})`,
                accentColor: COLORS.accent,
                investedLabel: 'Invested',
                investedValue: fmt(vanguard.invested),
                valueLabel: 'Current value',
                currentValue: fmt(vanguard.value),
                pnlText: `${vanguard.pnl >= 0 ? '+' : ''}${fmt(vanguard.pnl)}`,
                pnlPercentText: pct(vanguard.pnlPercent),
                pnlHex: pnlColor(vanguard.pnlPercent),
                extraLine: evoText(evolution?.vanguard) || undefined,
            }) : ''}
          </td>
        </tr>

        <!-- Recent months -->
        <tr>
          <td>
            ${monthsTable(data.monthlyRows)}
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td align="center" style="padding:8px 0 28px;">
            <a href="${dashboardUrl}" style="display:inline-block; font-family:${FONT_DISPLAY}; font-size:13px; font-weight:600; color:#0a0a09; background-color:${COLORS.primary}; padding:12px 28px; border-radius:10px; text-decoration:none;">View full dashboard &rarr;</a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding-top:8px; border-top:1px solid ${COLORS.cardBorder};">
            <div style="font-family:${FONT_BODY}; font-size:11px; color:${COLORS.faint}; padding-top:18px;">
              Automated ${periodType} report from your Portfolio dashboard.
            </div>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
