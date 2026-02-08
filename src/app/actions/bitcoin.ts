
"use server";

interface OHLCData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

export async function fetchBitcoinHistory(timeframe: string) {
    try {
        if (timeframe === 'ALL') {
            // Use CoinCap for full history (reliable free tier)
            // It returns daily "price" (close price usually)
            const response = await fetch('https://api.coincap.io/v2/assets/bitcoin/history?interval=d1', {
                next: { revalidate: 3600 }
            });

            if (!response.ok) {
                console.error("CoinCap Error:", response.status, response.statusText);
                throw new Error("Failed to fetch from CoinCap");
            }

            const result = await response.json();
            const rawData = result.data; // [{ priceUsd: string, time: number, date: string }]

            // Aggregate to MONTHLY candles
            const monthlyCandles: Record<string, OHLCData> = {};

            rawData.forEach((item: any) => {
                const date = new Date(item.time);
                const key = `${date.getFullYear()}-${date.getMonth()}`; // Group by YYYY-MM
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
                    candle.close = price; // Update close to latest
                    // Open stays as first day's price
                }
            });

            // Convert to array
            const data = Object.values(monthlyCandles).sort((a, b) => a.time - b.time);

            return { source: 'CoinCap', data };
        }

        // Binance for other timeframes
        let interval = '1d';
        let limit = 365;

        if (timeframe === '1D') { interval = '15m'; limit = 96; }
        if (timeframe === '1W') { interval = '1h'; limit = 168; }
        if (timeframe === '1M') { interval = '4h'; limit = 180; }
        if (timeframe === '3M') { interval = '1d'; limit = 90; }
        if (timeframe === '1Y') { interval = '1d'; limit = 365; }

        const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`, {
            next: { revalidate: 300 }
        });

        if (!response.ok) {
            throw new Error("Failed to fetch from Binance");
        }

        const data = await response.json();
        return { source: 'Binance', data };

    } catch (error) {
        console.error("Primary Source Failed:", error);

        // Fallback 1: CoinGecko (Full History)
        if (timeframe === 'ALL') {
            try {
                console.log("Attempting Fallback: CoinGecko");
                const response = await fetch('https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=max', {
                    next: { revalidate: 3600 }
                });

                if (response.ok) {
                    const data = await response.json();
                    return { source: 'CoinGecko', data }; // Returns [time, open, high, low, close]
                }
            } catch (fbError) {
                console.error("Fallback 1 (CoinGecko) Failed:", fbError);
            }
        }

        // Fallback 2: Binance (Partial History, but better than nothing)
        try {
            console.log("Attempting Fallback: Binance (Max Limit)");
            const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1w&limit=1000`, {
                next: { revalidate: 300 }
            });

            if (response.ok) {
                const data = await response.json();
                return { source: 'Binance', data };
            }
        } catch (fbError2) {
            console.error("Fallback 2 (Binance) Failed:", fbError2);
        }

        throw new Error("Failed to fetch Bitcoin data from all sources.");
    }
}
