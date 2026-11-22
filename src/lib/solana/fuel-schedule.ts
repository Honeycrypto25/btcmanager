/**
 * When the DCA bot will really buy, so the "fuel" numbers follow the actual schedule instead of "now + N hours".
 *
 * The bot runs from ONE daily cron (09:00 UTC, see vercel.json) and buys when `intervalHours` have passed since the
 * last buy. So a buy can only happen at a 09:00 tick, and an interval of 23h means "every day", 30h "every 2 days".
 * Pure (no DB / network) so it can be tested.
 */

export const DCA_CRON_HOUR_UTC = 9;
const DAY_MS = 24 * 3600 * 1000;

/** Days between two real buys: the interval rounded UP to whole cron days (at least 1). */
export function buyPeriodDays(intervalHours: number): number {
    return Math.max(1, Math.ceil(intervalHours / 24));
}

/** First cron tick (09:00 UTC) at or after `t`. */
export function nextCronTick(t: number): number {
    const d = new Date(t);
    let tick = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), DCA_CRON_HOUR_UTC);
    if (tick < t) tick += DAY_MS;
    return tick;
}

export interface FuelProjection {
    /** Timestamps (ms) of the buys the current balance can still fund, in order. */
    buyTimes: number[];
    periodDays: number;
    /** Whole days the balance lasts from `now` (until the first buy that can't be funded). */
    daysRemaining: number;
}

export function projectBuys(args: { lastRunAt: number | null; intervalHours: number; balance: number; buyAmount: number; now: number; maxBuys?: number }): FuelProjection {
    const { lastRunAt, intervalHours, balance, buyAmount, now } = args;
    const periodDays = buyPeriodDays(intervalHours);
    if (!(buyAmount > 0) || !(balance >= buyAmount)) return { buyTimes: [], periodDays, daysRemaining: 0 };
    const fundable = Math.floor(balance / buyAmount + 1e-9);
    const due = lastRunAt != null ? lastRunAt + intervalHours * 3600 * 1000 : now;
    const first = nextCronTick(Math.max(due, now));
    const cap = Math.min(fundable, args.maxBuys ?? 40);
    const buyTimes = Array.from({ length: cap }, (_, i) => first + i * periodDays * DAY_MS);
    const lastFundable = first + (fundable - 1) * periodDays * DAY_MS;
    return { buyTimes, periodDays, daysRemaining: Math.max(0, Math.floor((lastFundable + periodDays * DAY_MS - now) / DAY_MS)) };
}
