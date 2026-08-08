// Client pentru Trading212 Public API (beta).
// Docs: https://docs.trading212.com/api
// Autentificare: HTTP Basic, username = API Key, password = API Secret.
//
// Endpoint-urile pentru poziții și istoric ordine (/equity/positions,
// /equity/history/orders) au fost confirmate printr-o implementare de
// referință funcțională (nu doar din documentație) — inclusiv câmpul
// walletImpact, care dă valoarea poziției deja convertită în moneda
// contului (rezolvă problema GBX/pence de la instrumentele listate la Londra).

const BASE_URLS: Record<string, string> = {
    live: 'https://live.trading212.com/api/v0',
    demo: 'https://demo.trading212.com/api/v0',
};

export class T212ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = 'T212ApiError';
        this.status = status;
    }
}

function authHeader(apiKey: string, apiSecret: string): string {
    const encoded = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    return `Basic ${encoded}`;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function t212Fetch(
    environment: string,
    path: string,
    apiKey: string,
    apiSecret: string,
    retriesLeft = 2
): Promise<any> {
    const base = BASE_URLS[environment] ?? BASE_URLS.live;
    const res = await fetch(`${base}${path}`, {
        headers: {
            Authorization: authHeader(apiKey, apiSecret),
            Accept: 'application/json',
        },
        cache: 'no-store',
    });

    if (res.status === 429 && retriesLeft > 0) {
        // Trading212 are limite stricte per-endpoint — așteptăm și reîncercăm
        // în loc să eșuăm imediat sincronizarea.
        const retryAfterHeader = res.headers.get('retry-after');
        const waitMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 4000;
        await sleep(Number.isFinite(waitMs) ? waitMs : 4000);
        return t212Fetch(environment, path, apiKey, apiSecret, retriesLeft - 1);
    }

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new T212ApiError(`T212 ${path} failed: ${res.status} ${body}`.slice(0, 500), res.status);
    }

    return res.json();
}

export interface T212Cash {
    free: number;
    total: number;
    invested: number;
    result: number; // unrealized P&L
    ppl: number;
    blocked?: number;
    pieCash?: number;
}

export interface T212Position {
    ticker: string;
    name: string;
    quantity: number;
    currentPrice: number;
    /** Moneda de tranzacționare a instrumentului (poate fi GBX = pence) */
    priceCurrency: string;
    /** Cost și valoare curentă — DEJA convertite în moneda contului, din walletImpact */
    cost: number;
    currentValue: number;
}

export interface T212PieSummary {
    id: number;
    name?: string;
    cash?: number;
    result?: {
        investedValue?: number;
        result?: number;
        value?: number;
    };
}

export interface T212Transaction {
    id?: string | number;
    type: string; // e.g. "DEPOSIT" | "WITHDRAW" | "TRANSFER"
    amount: number;
    dateTime: string;
    reference?: string;
}

export interface T212Order {
    externalId: string;
    ticker: string;
    name: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    priceCurrency: string;
    /** Suma totală, deja în moneda contului */
    total: number;
    filledAt: string;
    realizedProfit?: number;
}

/** Verifică validitatea unei perechi de credențiale — folosit la conectare */
export async function testConnection(
    environment: string,
    apiKey: string,
    apiSecret: string
): Promise<{ ok: true; currency?: string } | { ok: false; error: string }> {
    try {
        const info = await t212Fetch(environment, '/equity/account/info', apiKey, apiSecret);
        return { ok: true, currency: info?.currencyCode };
    } catch (err: any) {
        return { ok: false, error: err.message ?? 'Unknown error' };
    }
}

export async function getAccountInfo(environment: string, apiKey: string, apiSecret: string) {
    return t212Fetch(environment, '/equity/account/info', apiKey, apiSecret);
}

export async function getAccountCash(
    environment: string,
    apiKey: string,
    apiSecret: string
): Promise<T212Cash> {
    const data = await t212Fetch(environment, '/equity/account/cash', apiKey, apiSecret);
    return {
        free: data?.free ?? 0,
        total: data?.total ?? 0,
        invested: data?.invested ?? 0,
        result: data?.result ?? data?.ppl ?? 0,
        ppl: data?.ppl ?? data?.result ?? 0,
        blocked: data?.blocked,
        pieCash: data?.pieCash,
    };
}

/**
 * Poziții curente, cu valoare/cost DEJA convertite în moneda contului
 * (walletImpact.currentValue / totalCost) — nu mai trebuie să ghicim
 * conversia GBX→GBP sau altă monedă locală a instrumentului.
 */
export async function getPositions(
    environment: string,
    apiKey: string,
    apiSecret: string,
    accountCurrency: string
): Promise<T212Position[]> {
    const data = await t212Fetch(environment, '/equity/positions', apiKey, apiSecret);
    if (!Array.isArray(data)) return [];

    return data.map((position: any) => {
        const instrument = position.instrument ?? {};
        const impact = position.walletImpact ?? {};
        const quantity = Number(position.quantity) || 0;
        const averagePricePaid = Number(position.averagePricePaid) || 0;
        const currentPrice = Number(position.currentPrice) || 0;

        return {
            ticker: String(instrument.ticker ?? position.ticker ?? 'UNKNOWN'),
            name: String(instrument.name ?? instrument.shortName ?? instrument.ticker ?? 'Instrument'),
            quantity,
            currentPrice,
            priceCurrency: String(instrument.currencyCode ?? instrument.currency ?? accountCurrency),
            cost: Number(impact.totalCost ?? impact.cost) || averagePricePaid * quantity,
            currentValue: Number(impact.currentValue ?? impact.value) || currentPrice * quantity,
        };
    });
}

/** Listă de pies — reflectă automat compoziția curentă (post-rebalansare) */
export async function getPies(
    environment: string,
    apiKey: string,
    apiSecret: string
): Promise<T212PieSummary[]> {
    const data = await t212Fetch(environment, '/equity/pies', apiKey, apiSecret);
    if (!Array.isArray(data)) return [];
    return data;
}

/** Detaliu pentru un pie individual — inclusiv numele, care lista nu îl conține mereu */
export async function getPieDetail(
    environment: string,
    apiKey: string,
    apiSecret: string,
    pieId: number
): Promise<any> {
    return t212Fetch(environment, `/equity/pies/${pieId}`, apiKey, apiSecret);
}

/**
 * Istoricul de tranzacții cash (depuneri/retrageri), paginat prin cursor.
 * Se oprește după maxPages pentru siguranță (evită bucle infinite dacă API-ul se comportă neașteptat).
 *
 * Notă: la conturile cu investiție automată recurentă, banii pot trece
 * direct în ordine de cumpărare fără o "depunere" separată vizibilă aici —
 * pentru acele conturi, getOrderHistory() e sursa relevantă pentru cât s-a
 * investit efectiv, nu tranzacțiile cash.
 */
export async function getAllCashTransactions(
    environment: string,
    apiKey: string,
    apiSecret: string,
    maxPages = 20
): Promise<T212Transaction[]> {
    const results: T212Transaction[] = [];
    let path: string | null = '/history/transactions?limit=50';
    let pages = 0;

    while (path && pages < maxPages) {
        const data: any = await t212Fetch(environment, path, apiKey, apiSecret, 4);
        const items = Array.isArray(data?.items) ? data.items : [];
        results.push(...items);

        if (data?.nextPagePath) {
            path = data.nextPagePath.replace('/api/v0', '');
            await sleep(1000);
        } else {
            path = null;
        }
        pages++;
    }

    return results;
}

/**
 * Istoricul de ordine executate (cumpărări/vânzări), paginat prin cursor.
 * Fiecare item are forma { order: {...}, fill: {...} } — filtrăm doar cele
 * cu status FILLED și o dată de execuție reală.
 */
export async function getAllOrders(
    environment: string,
    apiKey: string,
    apiSecret: string,
    accountCurrency: string,
    maxPages = 20
): Promise<T212Order[]> {
    const results: T212Order[] = [];
    let path: string | null = '/equity/history/orders?limit=50';
    let pages = 0;

    while (path && pages < maxPages) {
        const data: any = await t212Fetch(environment, path, apiKey, apiSecret, 4);
        const items = Array.isArray(data?.items) ? data.items : [];

        for (const item of items) {
            const order = item.order ?? {};
            const fill = item.fill ?? {};
            const status = String(order.status ?? '').toUpperCase();
            if (status !== 'FILLED' || !fill.filledAt) continue;

            const instrument = order.instrument ?? {};
            const walletImpact = fill.walletImpact ?? {};
            const ticker = String(order.ticker ?? instrument.ticker ?? '');
            const price = Math.abs(Number(fill.price ?? order.limitPrice ?? order.stopPrice) || 0);
            const priceCurrency = String(instrument.currency ?? accountCurrency);
            const value = Math.abs(Number(walletImpact.netValue ?? order.filledValue ?? order.value) || 0);
            let signedQuantity = Number(fill.quantity ?? order.filledQuantity ?? order.quantity) || 0;
            if (!signedQuantity && price && value) signedQuantity = value / price;
            const side = String(order.side ?? '').toLowerCase();
            const isSell = signedQuantity < 0 || /sell/.test(side);

            const externalId = String(order.id ?? item.id ?? `${ticker}-${fill.filledAt}`);

            results.push({
                externalId,
                ticker,
                name: String(instrument.name ?? ticker),
                side: isSell ? 'SELL' : 'BUY',
                quantity: Math.abs(signedQuantity),
                price,
                priceCurrency,
                total: value || Math.abs(signedQuantity * price),
                filledAt: String(fill.filledAt ?? order.createdAt ?? new Date().toISOString()),
                realizedProfit: isSell && typeof walletImpact.realisedProfitLoss === 'number'
                    ? Number(walletImpact.realisedProfitLoss)
                    : undefined,
            });
        }

        if (data?.nextPagePath) {
            path = data.nextPagePath.replace('/api/v0', '');
            await sleep(1000);
        } else {
            path = null;
        }
        pages++;
    }

    return results;
}
