import { db } from './db';

const MEMPOOL_URL = 'https://mempool.space/api';
const BINANCE_URL = 'https://api.binance.com/api/v3';
const MEMPOOL_PAGE_LIMIT = 40;
const BLOCKCHAIN_INFO_LIMIT = 100;
const BLOCKCHAIN_INFO_MAX_PAGES = 10;

interface WalletTx {
    txid: string;
    timestamp: number;
    amount: number;
    priceAtTime?: number;
}

export type BitcoinAthMeta = {
    ath: number;
    athDate: string;
};

function getCoinGeckoHeaders() {
    const apiKey = process.env.COINGECKO_API_KEY;
    return apiKey ? { "x-cg-demo-api-key": apiKey } : undefined;
}

function mapMempoolTransactions(txs: any[], address: string): WalletTx[] {
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
        if (netChange <= 0) return null;

        return {
            txid: t.txid,
            timestamp: (t.status.block_time || Math.floor(Date.now() / 1000)) * 1000,
            amount: netChange / 100_000_000,
        };
    }).filter((t: WalletTx | null): t is WalletTx => t !== null);
}

export async function fetchMempoolTransactions(address: string): Promise<WalletTx[]> {
    const allTxs: any[] = [];
    let endpoint = `${MEMPOOL_URL}/address/${address}/txs`;

    try {
        for (let page = 0; page < MEMPOOL_PAGE_LIMIT; page += 1) {
            const res = await fetch(endpoint, { cache: 'no-store' });
            if (!res.ok) {
                throw new Error(`mempool.space returned ${res.status}`);
            }

            const txs = await res.json();
            if (!Array.isArray(txs) || txs.length === 0) break;

            allTxs.push(...txs);
            const confirmed = txs.filter((tx: any) => tx.status?.confirmed);
            if (confirmed.length < 25) break;

            endpoint = `${MEMPOOL_URL}/address/${address}/txs/chain/${confirmed[confirmed.length - 1].txid}`;
        }

        return mapMempoolTransactions(allTxs, address);
    } catch (err) {
        console.error(`Mempool fetch error for ${address}:`, err);
        throw err;
    }
}

export async function fetchBlockchainInfoTransactions(address: string): Promise<WalletTx[]> {
    const allTxs: any[] = [];

    try {
        for (let page = 0; page < BLOCKCHAIN_INFO_MAX_PAGES; page += 1) {
            const offset = page * BLOCKCHAIN_INFO_LIMIT;
            const res = await fetch(
                `https://blockchain.info/rawaddr/${address}?limit=${BLOCKCHAIN_INFO_LIMIT}&offset=${offset}`,
                { cache: 'no-store' }
            );
            if (!res.ok) {
                throw new Error(`blockchain.info returned ${res.status}`);
            }

            const data = await res.json();
            const txs = Array.isArray(data.txs) ? data.txs : [];
            allTxs.push(...txs);
            if (txs.length < BLOCKCHAIN_INFO_LIMIT) break;
        }

        return allTxs.map((t: any) => {
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
            if (net <= 0) return null;

            return {
                txid: t.hash,
                timestamp: t.time * 1000,
                amount: net / 100_000_000,
            };
        }).filter((t: WalletTx | null): t is WalletTx => t !== null);
    } catch (err) {
        console.error(`Blockchain.info fetch error for ${address}:`, err);
        throw err;
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
    const [mempoolResult, bcInfoResult, priceHistory, currentPrice] = await Promise.all([
        fetchMempoolTransactions(address).then(value => ({ value, error: null })).catch(error => ({ value: [] as WalletTx[], error })),
        fetchBlockchainInfoTransactions(address).then(value => ({ value, error: null })).catch(error => ({ value: [] as WalletTx[], error })),
        getPriceHistory('1d', 1000),
        getCurrentBtcPrice(),
    ]);

    if (mempoolResult.error && bcInfoResult.error) {
        throw new Error(`Both blockchain sources failed for ${address}`);
    }

    const allTxsMap = new Map<string, WalletTx>();
    mempoolResult.value.forEach(tx => allTxsMap.set(tx.txid, tx));
    bcInfoResult.value.forEach(tx => {
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
            const price = candle ? candle.close : (priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].close : currentPrice);

            return {
                txid: tx.txid,
                amount: tx.amount,
                priceAtTime: price,
                timestamp: new Date(tx.timestamp),
                walletId,
            };
        });

        await db.bitcoinTransaction.createMany({ data: toInsert, skipDuplicates: true });
    }

    return {
        added: newTxs.length,
        total: uniqueTxs.length,
        sources: {
            mempool: mempoolResult.error ? 'failed' : 'ok',
            blockchainInfo: bcInfoResult.error ? 'failed' : 'ok',
        },
    };
}

export async function getCurrentBtcPrice(): Promise<number> {
    const cmcKey = process.env.CMC_API_KEY;

    if (cmcKey) {
        try {
            const res = await fetch('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=BTC', {
                headers: { 'X-CMC_PRO_API_KEY': cmcKey },
                next: { revalidate: 60 },
            });
            const data = await res.json();
            return Number(data?.data?.BTC?.quote?.USD?.price || 0);
        } catch (e) {
            console.warn("CMC fetch failed, falling back to Coinbase");
        }
    }

    try {
        const res = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot', { next: { revalidate: 60 } });
        const data = await res.json();
        return Number(data?.data?.amount || 0);
    } catch (e) {
        return 0;
    }
}

export async function getBitcoinAthMeta(): Promise<BitcoinAthMeta | null> {
    try {
        const res = await fetch(
            'https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false',
            { cache: 'no-store', headers: getCoinGeckoHeaders() }
        );

        if (!res.ok) return null;

        const data = await res.json();
        const ath = Number(data?.market_data?.ath?.usd ?? 0);
        const athDate = data?.market_data?.ath_date?.usd;
        if (!ath || !athDate) return null;

        return { ath, athDate };
    } catch (e) {
        return null;
    }
}
