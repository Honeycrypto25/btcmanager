import "server-only";

/**
 * Minimal TrueLayer Data API client — Open Banking (UK) transaction import.
 * Docs: https://docs.truelayer.com/docs/data-api-basics
 *
 * Kept deliberately small: just enough to run the "connect once, sync
 * periodically" flow used by src/app/api/truelayer/* and the sync cron.
 */

const AUTH_BASE = "https://auth.truelayer.com";
const API_BASE = "https://api.truelayer.com";

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
}

function clientId(): string {
    return requireEnv("TRUELAYER_CLIENT_ID");
}

function clientSecret(): string {
    return requireEnv("TRUELAYER_CLIENT_SECRET");
}

function redirectUri(): string {
    // Must exactly match a Redirect URI configured in the TrueLayer Console.
    return process.env.TRUELAYER_REDIRECT_URI || `${requireEnv("NEXTAUTH_URL")}/api/truelayer/callback`;
}

/** Builds the hosted TrueLayer authorisation URL the user is redirected to
 * in order to pick their bank and log in. `state` is an opaque, unguessable
 * value we generate and verify on callback (CSRF protection). */
export function buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId(),
        redirect_uri: redirectUri(),
        scope: "info accounts balance transactions offline_access",
        // uk-ob-all: all UK Open Banking regulated providers. uk-oauth-all
        // covers a handful of UK banks that support OAuth outside standard
        // Open Banking. Together this is TrueLayer's recommended default
        // for "any UK bank".
        providers: "uk-ob-all uk-oauth-all",
        state,
    });
    return `${AUTH_BASE}/?${params.toString()}`;
}

export interface TokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number; // seconds
    token_type: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
    const res = await fetch(`${AUTH_BASE}/connect/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body).toString(),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`TrueLayer token request failed (${res.status}): ${text.slice(0, 500)}`);
    }
    return res.json();
}

export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
    return tokenRequest({
        grant_type: "authorization_code",
        client_id: clientId(),
        client_secret: clientSecret(),
        redirect_uri: redirectUri(),
        code,
    });
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    return tokenRequest({
        grant_type: "refresh_token",
        client_id: clientId(),
        client_secret: clientSecret(),
        refresh_token: refreshToken,
    });
}

async function apiGet<T = unknown>(accessToken: string, path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`TrueLayer API GET ${path} failed (${res.status}): ${text.slice(0, 500)}`);
    }
    const json = (await res.json()) as { results?: T } & T;
    return (json.results ?? json) as T;
}

export interface TrueLayerAccount {
    account_id: string;
    display_name: string;
    currency: string;
    provider: { display_name: string };
}

export function fetchAccounts(accessToken: string): Promise<TrueLayerAccount[]> {
    return apiGet<TrueLayerAccount[]>(accessToken, "/data/v1/accounts");
}

export interface TrueLayerTransaction {
    transaction_id: string;
    timestamp: string; // ISO date
    description: string;
    amount: number; // negative = money out, positive = money in
    currency: string;
    transaction_type: string;
    transaction_category: string;
    merchant_name?: string;
    running_balance?: { amount: number; currency: string };
}

/** TrueLayer's transactions endpoint accepts an optional [from, to] window
 * (ISO date, inclusive). Defaults to whatever range the provider returns
 * (typically 90 days) when omitted. */
export function fetchTransactions(accessToken: string, accountId: string, from?: string, to?: string): Promise<TrueLayerTransaction[]> {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return apiGet<TrueLayerTransaction[]>(accessToken, `/data/v1/accounts/${accountId}/transactions${qs ? `?${qs}` : ""}`);
}
