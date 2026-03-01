
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

        // 3. Fallback: KRAKEN (Works when Binance blocks IP via 451)
        try {
            console.log("Attempting Fallback: Kraken API");
            let krakenInterval = 1440; // 1 day in minutes

            if (timeframe === '1D') krakenInterval = 15;
            if (timeframe === '1W') krakenInterval = 60;
            if (timeframe === '1M') krakenInterval = 240;
            if (timeframe === '3M') krakenInterval = 1440;
            if (timeframe === 'ALL') krakenInterval = 10080; // 1 week candles for ALL

            const response = await fetch(`https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=${krakenInterval}`, {
                next: { revalidate: 3600 }
            });

            if (response.ok) {
                const krakenRaw = await response.json();
                
                if (krakenRaw.error && krakenRaw.error.length > 0) {
                     throw new Error(krakenRaw.error[0]);
                }

                const pairs = Object.keys(krakenRaw.result).filter(k => k !== 'last');
                if (pairs.length > 0) {
                    const ohlcArray = krakenRaw.result[pairs[0]];
                    
                    // Limit to approximately what we need based on timeframe
                    let limit = 365;
                    if (timeframe === '1D') limit = 96;
                    if (timeframe === '1W') limit = 168;
                    if (timeframe === '1M') limit = 180;
                    if (timeframe === '3M') limit = 90;
                    if (timeframe === 'ALL') limit = 1000;

                    // Take the most recent 'limit' records
                    const sliced = ohlcArray.slice(-limit);

                    const data = sliced.map((item: any[]) => ({
                        time: item[0], // Kraken already gives seconds
                        open: parseFloat(item[1]),
                        high: parseFloat(item[2]),
                        low: parseFloat(item[3]),
                        close: parseFloat(item[4])
                    }));

                    return { source: 'Kraken', data };
                }
            }
        } catch (krakenError) {
            console.error("Kraken fallback failed:", krakenError);
        }

        throw new Error("Failed to fetch Bitcoin data from all sources.");
    }
}
