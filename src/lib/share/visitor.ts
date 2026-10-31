import { createHash } from "crypto";

const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|skype|slack|discord|embedly|curl|wget|python-requests|headless|lighthouse|monitor/i;

export interface VisitorInfo {
    country: string | null;
    region: string | null;
    city: string | null;
    ipMasked: string | null;
    visitorHash: string | null;
    userAgent: string | null;
    browser: string | null;
    os: string | null;
    device: string | null;
    referrer: string | null;
    isBot: boolean;
}

function safeDecode(v: string | null): string | null {
    if (!v) return null;
    try {
        return decodeURIComponent(v).slice(0, 80);
    } catch {
        return v.slice(0, 80);
    }
}

function maskIp(ip: string | null): string | null {
    if (!ip) return null;
    if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":") + "::";
    const p = ip.split(".");
    return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.0` : null;
}

function parseUa(ua: string): { browser: string; os: string; device: string } {
    const browser =
        /Edg\//.test(ua) ? "Edge" :
        /OPR\/|Opera/.test(ua) ? "Opera" :
        /Firefox\//.test(ua) ? "Firefox" :
        /(CriOS|Chrome)\//.test(ua) ? "Chrome" :
        /Safari\//.test(ua) ? "Safari" : "Altul";
    const os =
        /Windows/.test(ua) ? "Windows" :
        /iPhone|iPad|iPod/.test(ua) ? "iOS" :
        /Android/.test(ua) ? "Android" :
        /Mac OS X/.test(ua) ? "macOS" :
        /Linux/.test(ua) ? "Linux" : "Altul";
    const device = /iPad|Tablet/.test(ua) ? "Tabletă" : /Mobi|iPhone|Android/.test(ua) ? "Telefon" : "Calculator";
    return { browser, os, device };
}

/** Everything we keep about a visit, from request headers only (no extra lookups). */
export function readVisitor(headers: Headers, salt: string): VisitorInfo {
    const ua = headers.get("user-agent") ?? "";
    const ip = (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || headers.get("x-real-ip");
    const parsed = parseUa(ua);
    let referrer: string | null = null;
    const ref = headers.get("referer");
    if (ref) {
        try { referrer = new URL(ref).host; } catch { referrer = ref.slice(0, 80); }
    }
    return {
        country: headers.get("x-vercel-ip-country"),
        region: safeDecode(headers.get("x-vercel-ip-country-region")),
        city: safeDecode(headers.get("x-vercel-ip-city")),
        ipMasked: maskIp(ip),
        visitorHash: ip || ua ? createHash("sha256").update(`${salt}|${ip ?? ""}|${ua}`).digest("hex").slice(0, 16) : null,
        userAgent: ua ? ua.slice(0, 400) : null,
        ...parsed,
        referrer,
        isBot: !ua || BOT_RE.test(ua),
    };
}
