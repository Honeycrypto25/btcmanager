import { db } from './db';

const MEMPOOL_URL = 'https://mempool.space/api';
const BINANCE_URL = 'https://api.binance.com/api/v3';

interface WalletTx {
    txid: string;
    timestamp: number;
    amount: number; // in BTC
    priceAtTime?: number;
}

export async function fetchMempoolTransactions(address: string): Promise<WalletTx[]> {
    try {
        const res = await fetch(`${MEMPOOL_URL}/address/${address}/txs`, {
            cache: 'no-store',
        });

        if (!res.ok) return [];

        const txs = await res.json();

        return txs.map((t: any) => {
            const receivedAmount = t.vout.reduce((acc: number, out: any) => {
                if (out.scriptpubkey_address?.toLowerCase() === address.toLowerCase()) {
                    return acc + out.value;
                }
                return acc;
            }, 0);

            const sentAmount = t.vin.reduce((acc: number, vin: any) => {
                if (vin.prevout?.scriptpubkey_address?.toLowerCase() === address.toLowerCase()) {
                    return acc + vin.prevout.value;
                }
                return acc;
            }, 0);

            const netChange = receivedAmount - sentAmount;
            let ts = t.status.block_time || Math.floor(Date.now() / 1000);

            if (netChange > 0) {
                return {
                    txid: t.txid,
                    timestamp: ts * 1000,
                    amount: netChange / 100_000_000,
                };
            }
            return null;
        }).filter((t: any): t is WalletTx => t !== null);
    } catch (err) {
        console.error(`Mempool fetch error:`, err);
        return [];
    }
}

export async function fetchBlockchainInfoTransactions(address: string): Promise<WalletTx[]> {
    try {
        const res = await fetch(`https://blockchain.info/rawaddr/${address}?limit=100`, {
            cache: 'no-store',
        });
        if (!res.ok) return [];

        const data = await res.json();
        const txs = data.txs || [];

        return txs.map((t: any) => {
            const received = t.out.reduce((acc: number, o: any) => {
                if (o.addr?.toLowerCase() === address.toLowerCase()) return acc + o.value;
                return acc;
            }, 0);

            const sent = t.inputs.reduce((acc: number, i: any) => {
                if (i.prev_out?.addr?.toLowerCase() === address.toLowerCase()) {
                    return acc + i.prev_out.value;
                }
                return acc;
            }, 0);

            const net = received - sent;

            if (net > 0) {
                return {
                    txid: t.hash,
                    timestamp: t.time * 1000,
                    amount: net / 100_000_000,
                };
            }
            return null;
        }).filter((t: any): t is WalletTx => t !== null);
    } catch (err) {
        console.error(`Blockchain.info fetch error:`, err);
        return [];
    }
}

export async function getPriceHistory(interval: string = '1d', limit: number = 1000) {
    try {
        const res = await fetch(`${BINANCE_URL}/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`, {
            next: { revalidate: 3600 },
        });

        if (res.ok) {
            const data = await res.json();
            return data.map((d: any[]) => ({
                time: d[0],
                close: parseFloat(d[4]),
            })).sort((a: any, b: any) => a.time - b.time);
        }
    } catch (e) {
        console.warn(`Price history fetch failed`);
    }
    return [];
}

export async function syncWallet(walletId: string, address: string) {
    const [mempoolTxs, bcInfoTxs, priceHistory] = await Promise.all([
        fetchMempoolTransactions(address),
        fetchBlockchainInfoTransactions(address),
        getPriceHistory('1d', 1000),
    ]);

    const allTxsMap = new Map<string, WalletTx>();
    mempoolTxs.forEach(tx => allTxsMap.set(tx.txid, tx));
    bcInfoTxs.forEach(tx => {
        if (!allTxsMap.has(tx.txid)) allTxsMap.set(tx.txid, tx);
    });

    const uniqueTxs = Array.from(allTxsMap.values());
    const existingTxs = await db.bitcoinTransaction.findMany({
        where: { walletId },
        select: { txid: true },
    });
    const existingSet = new Set(existingTxs.map((t: { txid: string }) => t.txid));

    const newTxs = uniqueTxs.filter(tx => !existingSet.has(tx.txid));

    if (newTxs.length > 0) {
        const toInsert = newTxs.map(tx => {
            const candle = priceHistory.find((p: { time: number; close: number }) => p.time >= tx.timestamp);
            const price = candle ? candle.close : (priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].close : 95000);

            return {
                txid: tx.txid,
                amount: tx.amount,
                priceAtTime: price,
                timestamp: new Date(tx.timestamp),
                walletId,
            };
        });

        await db.bitcoinTransaction.createMany({
            data: toInsert,
            skipDuplicates: true,
        });
    }

    return { added: newTxs.length, total: uniqueTxs.length };
}

export async function getCurrentBtcPrice(): Promise<number> {
    const cmcKey = process.env.CMC_API_KEY;

    if (cmcKey) {
        try {
            const res = await fetch('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=BTC', {
                headers: {
                    'X-CMC_PRO_API_KEY': cmcKey,
                },
                next: { revalidate: 60 },
            });
            const data = await res.json();
            return Number(data?.data?.BTC?.quote?.USD?.price || 95000);
        } catch (e) {
            console.warn("CMC fetch failed, falling back to Coinbase");
        }
    }

    try {
        const res = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot', {
            next: { revalidate: 60 },
        });
        const data = await res.json();
        return Number(data?.data?.amount || 95000);
    } catch (e) {
        return 95000;
    }
}
