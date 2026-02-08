
"use server";

interface OHLCData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

export async function fetchBitcoinHistory(timeframe: string) {
    // 1. Try COINCAP for 'ALL' (Best for full history)
    if (timeframe === 'ALL') {
        try {
            const response = await fetch('https://api.coincap.io/v2/assets/bitcoin/history?interval=d1', {
                next: { revalidate: 3600 }
            });

            if (response.ok) {
                const result = await response.json();
                const rawData = result.data;

                // Aggregate to MONTHLY candles for clean long-term view
                const monthlyCandles: Record<string, OHLCData> = {};

                rawData.forEach((item: any) => {
                    const date = new Date(item.time);
                    const key = `${date.getFullYear()}-${date.getMonth()}`;
                    const price = parseFloat(item.priceUsd);

                    if (!monthlyCandles[key]) {
                        monthlyCandles[key] = {
                            time: new Date(date.getFullYear(), date.getMonth(), 1).getTime() / 1000,
                            open: price,
                            high: price,
                            low: price,
                            close: price
                        };
                    } else {
                        const candle = monthlyCandles[key];
                        candle.high = Math.max(candle.high, price);
                        candle.low = Math.min(candle.low, price);
                        candle.close = price;
                    }
                });

                const data = Object.values(monthlyCandles).sort((a, b) => a.time - b.time);
                return { source: 'CoinCap', data };
            }
        } catch (e) {
            console.warn("CoinCap (ALL) failed, falling back...");
        }
    }

    // 2. Try BINANCE (Primary for non-ALL)
    try {
        let interval = '1d';
        let limit = 365;

        // Binance Intervals: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M
        if (timeframe === '1D') { interval = '15m'; limit = 96; }
        if (timeframe === '1W') { interval = '1h'; limit = 168; }
        if (timeframe === '1M') { interval = '4h'; limit = 180; }
        if (timeframe === '3M') { interval = '1d'; limit = 90; }
        if (timeframe === '1Y') { interval = '1d'; limit = 365; }

        const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`, {
            next: { revalidate: 300 }
        });

        if (response.ok) {
            const data = await response.json();
            return { source: 'Binance', data };
        }
        throw new Error(`Binance returned ${response.status}`);

    } catch (binanceError) {
        console.error("Binance attempt failed:", binanceError);

        // 3. Fallback: COINGECKO (Works for everything)
        try {
            console.log("Attempting Fallback: CoinGecko");
            let days = '365';
            if (timeframe === '1D') days = '1';
            if (timeframe === '1W') days = '7';
            if (timeframe === '1M') days = '30';
            if (timeframe === '3M') days = '90';
            if (timeframe === 'ALL') days = 'max';

            const response = await fetch(`https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=${days}`, {
                next: { revalidate: 3600 }
            });

            if (response.ok) {
                const data = await response.json();
                return { source: 'CoinGecko', data };
            }
        } catch (cgError) {
            console.error("CoinGecko fallback failed:", cgError);
        }

        // 4. Last Resort: BINANCE Monthly (Very likely to work / less restricted sometimes)
        try {
            console.log("Attempting Last Resort: Binance Monthly");
            const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1M&limit=60`, {
                next: { revalidate: 3600 }
            });

            if (response.ok) {
                const data = await response.json();
                return { source: 'Binance', data };
            }
        } catch (lastError) {
            console.error("Last resort failed:", lastError);
        }

        throw new Error("Failed to fetch Bitcoin data from all sources.");
    }
}
