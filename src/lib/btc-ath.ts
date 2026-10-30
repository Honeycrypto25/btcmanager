import "server-only";
import { getBitcoinAthMeta } from "@/lib/btc";
import { getBtcDailyPrices } from "@/lib/btc-price-history";

export interface BtcAth {
    price: number;
    /** ISO date of the all-time high, when known. */
    date: string | null;
}

/**
 * Last all-time high of BTC/USD: CoinGecko first; if it doesn't answer, the
 * highest daily close in our own cached price history (about 5 years). A
 * live price above the stored ATH means a new ATH was just set.
 */
export async function getBtcAth(currentPrice: number): Promise<BtcAth | null> {
    let price = 0;
    let date: string | null = null;
    const meta = await getBitcoinAthMeta();
    if (meta) {
        price = meta.ath;
        date = meta.athDate;
    } else {
        try {
            const { prices } = await getBtcDailyPrices(2000);
            for (const p of prices) {
                if (p.price > price) {
                    price = p.price;
                    date = new Date(p.time).toISOString();
                }
            }
        } catch (e) {
            console.error("ATH fallback failed", e);
        }
    }
    if (currentPrice > price) {
        price = currentPrice;
        date = new Date().toISOString();
    }
    return price > 0 ? { price, date } : null;
}
