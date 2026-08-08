// Client pentru Trading212 Public API (beta).
// Docs: https://docs.trading212.com/api
// Autentificare: HTTP Basic, username = API Key, password = API Secret.

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
    quantity: number;
    averagePrice: number;
    currentPrice: number;
    ppl: number;
    initialFillDate?: string;
    /** Moneda de tranzacționare a instrumentului — poate diferi de moneda contului (ex: GBX pentru instrumente listate la Londra) */
    currency?: string;
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
    type: string; // e.g. "DEPOSIT" | "WITHDRAWAL" | ...
    amount: number;
    dateTime: string;
    reference?: string;
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

export async function getPortfolio(
    environment: string,
    apiKey: string,
    apiSecret: string
): Promise<T212Position[]> {
    const data = await t212Fetch(environment, '/equity/portfolio', apiKey, apiSecret);
    if (!Array.isArray(data)) return [];
    return data.map((p: any) => ({
        ticker: p.ticker,
        quantity: p.quantity ?? 0,
        averagePrice: p.averagePrice ?? 0,
        currentPrice: p.currentPrice ?? 0,
        ppl: p.ppl ?? 0,
        initialFillDate: p.initialFillDate,
        currency: p.currency ?? p.instrument?.currency ?? undefined,
    }));
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
        const data: any = await t212Fetch(environment, path, apiKey, apiSecret);
        const items = Array.isArray(data?.items) ? data.items : [];
        results.push(...items);

        if (data?.nextPagePath) {
            // nextPagePath vine deja ca path complet (ex: /history/transactions?cursor=...)
            path = data.nextPagePath.replace('/api/v0', '');
            await sleep(1000);
        } else {
            path = null;
        }
        pages++;
    }

    return results;
}
