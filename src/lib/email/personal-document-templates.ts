// Plain, self-contained HTML email templates for the personal Document
// module — deliberately not sharing code with report-template.ts (that one
// is a large data dashboard email; these are short, single-purpose
// notices), but reusing the same color palette for visual consistency.

const COLORS = {
    bg: "#0a0a09",
    card: "#131311",
    cardBorder: "#26241f",
    foreground: "#f5f4f0",
    muted: "#a8a6a0",
    faint: "#6b6963",
    primary: "#d6a24c",
    primarySoft: "rgba(214,162,76,0.12)",
    red: "#e5605a",
    redSoft: "rgba(229,96,90,0.12)",
    amber: "#e0a94e",
    amberSoft: "rgba(224,169,78,0.12)",
};

const FONT_BODY = "Helvetica, Arial, sans-serif";

function shell(bodyHtml: string): string {
    return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:${COLORS.bg};font-family:${FONT_BODY};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${COLORS.card};border:1px solid ${COLORS.cardBorder};border-radius:16px;overflow:hidden;">
          ${bodyHtml}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function fmtDate(d: Date): string {
    return d.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
}

export function buildReminderEmailHtml(params: {
    title: string;
    person: string;
    category: string;
    expiryDate: Date;
    daysUntilExpiry: number;
    dashboardUrl: string;
}): string {
    const { title, person, category, expiryDate, daysUntilExpiry, dashboardUrl } = params;
    const overdue = daysUntilExpiry < 0;
    const tone = overdue ? COLORS.red : daysUntilExpiry <= 7 ? COLORS.red : COLORS.amber;
    const toneSoft = overdue ? COLORS.redSoft : daysUntilExpiry <= 7 ? COLORS.redSoft : COLORS.amberSoft;
    const statusLine = overdue
        ? `A expirat acum ${Math.abs(daysUntilExpiry)} ${Math.abs(daysUntilExpiry) === 1 ? "zi" : "zile"}`
        : daysUntilExpiry === 0
        ? "Expiră astăzi"
        : `Expiră în ${daysUntilExpiry} ${daysUntilExpiry === 1 ? "zi" : "zile"}`;

    return shell(`
    <tr><td style="padding:28px 28px 0 28px;">
      <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${toneSoft};color:${tone};font-size:12px;font-weight:600;letter-spacing:0.02em;">${statusLine}</span>
    </td></tr>
    <tr><td style="padding:14px 28px 4px 28px;">
      <h1 style="margin:0;font-size:20px;font-weight:600;color:${COLORS.foreground};">${title}</h1>
      <p style="margin:4px 0 0 0;font-size:13px;color:${COLORS.muted};">${person} · ${category}</p>
    </td></tr>
    <tr><td style="padding:16px 28px 4px 28px;">
      <p style="margin:0;font-size:14px;color:${COLORS.muted};line-height:1.6;">
        Data expirării: <strong style="color:${COLORS.foreground};">${fmtDate(expiryDate)}</strong>.
        ${overdue ? "Documentul este expirat — încarcă versiunea nouă cât mai curând ca să opreşti aceste remindere." : "Încarcă din timp versiunea nouă ca să nu rămâi fără el activ."}
      </p>
    </td></tr>
    <tr><td style="padding:20px 28px 28px 28px;">
      <a href="${dashboardUrl}/personal-documents" style="display:inline-block;padding:10px 18px;border-radius:10px;background:${COLORS.primary};color:#141210;font-size:14px;font-weight:600;text-decoration:none;">Deschide Documente</a>
    </td></tr>
    <tr><td style="padding:0 28px 24px 28px;border-top:1px solid ${COLORS.cardBorder};">
      <p style="margin:16px 0 0 0;font-size:11px;color:${COLORS.faint};">Primeşti acest email pentru că documentul de mai sus e aproape de expirare sau expirat, în contul tău Evama.net.</p>
    </td></tr>
  `);
}

export function buildShareEmailHtml(params: {
    title: string;
    person: string;
    signedUrl: string;
    expiresInDays: number;
}): string {
    const { title, person, signedUrl, expiresInDays } = params;
    return shell(`
    <tr><td style="padding:28px 28px 4px 28px;">
      <h1 style="margin:0;font-size:20px;font-weight:600;color:${COLORS.foreground};">${title}</h1>
      <p style="margin:4px 0 0 0;font-size:13px;color:${COLORS.muted};">Document partajat — ${person}</p>
    </td></tr>
    <tr><td style="padding:16px 28px 4px 28px;">
      <p style="margin:0;font-size:14px;color:${COLORS.muted};line-height:1.6;">
        Ai primit acces la acest document. Link-ul de mai jos e valabil ${expiresInDays} zile, apoi expiră automat.
      </p>
    </td></tr>
    <tr><td style="padding:20px 28px 28px 28px;">
      <a href="${signedUrl}" style="display:inline-block;padding:10px 18px;border-radius:10px;background:${COLORS.primary};color:#141210;font-size:14px;font-weight:600;text-decoration:none;">Deschide documentul</a>
    </td></tr>
  `);
}
