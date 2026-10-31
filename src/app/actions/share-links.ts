"use server";

import { randomBytes } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";

async function adminUserId(): Promise<string> {
    await requireAdmin();
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) throw new Error("Unauthorized");
    return userId;
}

export interface ShareLinkRow {
    id: string;
    token: string;
    label: string;
    tokenSymbol: string;
    createdAt: string;
    expiresAt: string | null;
    revokedAt: string | null;
    views: number; // human visits (bots excluded)
    uniqueVisitors: number;
    botHits: number;
    lastViewAt: string | null;
}

export interface ShareViewRow {
    id: string;
    createdAt: string;
    country: string | null;
    region: string | null;
    city: string | null;
    ipMasked: string | null;
    browser: string | null;
    os: string | null;
    device: string | null;
    referrer: string | null;
    isBot: boolean;
}

/** Tokens a link can be limited to. */
export async function listShareableTokens(): Promise<{ id: string; symbol: string }[]> {
    const userId = await adminUserId();
    const rows = await db.polygonTokenSettings.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { id: true, tokenSymbol: true } });
    return rows.map((r) => ({ id: r.id, symbol: r.tokenSymbol }));
}

export async function listShareLinks(): Promise<ShareLinkRow[]> {
    const userId = await adminUserId();
    const links = await db.shareLink.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: { views: { select: { createdAt: true, visitorHash: true, isBot: true } } },
    });
    return links.map((l) => {
        const human = l.views.filter((v) => !v.isBot);
        const last = human.reduce<Date | null>((m, v) => (!m || v.createdAt > m ? v.createdAt : m), null);
        return {
            id: l.id,
            token: l.token,
            label: l.label,
            tokenSymbol: l.tokenSymbol,
            createdAt: l.createdAt.toISOString(),
            expiresAt: l.expiresAt?.toISOString() ?? null,
            revokedAt: l.revokedAt?.toISOString() ?? null,
            views: human.length,
            uniqueVisitors: new Set(human.map((v) => v.visitorHash ?? v.createdAt.toISOString())).size,
            botHits: l.views.length - human.length,
            lastViewAt: last?.toISOString() ?? null,
        };
    });
}

export async function createShareLink(input: { label: string; settingsId: string; expiresInDays?: number | null }): Promise<ShareLinkRow> {
    const userId = await adminUserId();
    const label = input.label.trim().slice(0, 80);
    if (!label) throw new Error("Pune o etichetă (pentru cine e linkul).");
    const settings = await db.polygonTokenSettings.findFirst({ where: { id: input.settingsId, userId }, select: { id: true, tokenSymbol: true } });
    if (!settings) throw new Error("Token inexistent.");
    const days = input.expiresInDays && input.expiresInDays > 0 ? Math.min(input.expiresInDays, 3650) : null;
    const link = await db.shareLink.create({
        data: {
            userId,
            token: randomBytes(24).toString("base64url"),
            label,
            settingsId: settings.id,
            tokenSymbol: settings.tokenSymbol,
            expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null,
        },
    });
    return {
        id: link.id, token: link.token, label: link.label, tokenSymbol: link.tokenSymbol,
        createdAt: link.createdAt.toISOString(), expiresAt: link.expiresAt?.toISOString() ?? null, revokedAt: null,
        views: 0, uniqueVisitors: 0, botHits: 0, lastViewAt: null,
    };
}

export async function setShareLinkRevoked(id: string, revoked: boolean): Promise<void> {
    const userId = await adminUserId();
    await db.shareLink.updateMany({ where: { id, userId }, data: { revokedAt: revoked ? new Date() : null } });
}

export async function deleteShareLink(id: string): Promise<void> {
    const userId = await adminUserId();
    await db.shareLink.deleteMany({ where: { id, userId } });
}

export async function listShareLinkViews(id: string): Promise<ShareViewRow[]> {
    const userId = await adminUserId();
    const link = await db.shareLink.findFirst({ where: { id, userId }, select: { id: true } });
    if (!link) return [];
    const rows = await db.shareLinkView.findMany({ where: { linkId: id }, orderBy: { createdAt: "desc" }, take: 200 });
    return rows.map((r) => ({
        id: r.id, createdAt: r.createdAt.toISOString(), country: r.country, region: r.region, city: r.city,
        ipMasked: r.ipMasked, browser: r.browser, os: r.os, device: r.device, referrer: r.referrer, isBot: r.isBot,
    }));
}
