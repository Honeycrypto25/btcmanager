/**
 * Static definition of the "Personal Finance & Life Dashboard" build roadmap.
 * This is the source of truth used to seed the DevTask table (see
 * actions/dev-tasks.ts). Editing this file and redeploying adds any new
 * items to the /tasks page without touching existing rows or their status.
 *
 * `doneOnSeed: true` marks items that are already implemented as of the
 * commit that introduces them — used only the first time a row is created.
 */

export interface RoadmapItem {
    phase: string;
    section: string;
    title: string;
    description?: string;
    doneOnSeed?: boolean;
}

export const ROADMAP: RoadmapItem[] = [
    // --- Phase 1 ---
    { phase: "Phase 1", section: "Foundation", title: "Inspectare proiect existent (BTC + Trading 212)", doneOnSeed: true },
    { phase: "Phase 1", section: "Foundation", title: "Navigație extinsă (Self Employed, Tasks)", doneOnSeed: true },
    { phase: "Phase 1", section: "Foundation", title: "Modul intern /tasks cu istoric dezvoltare", doneOnSeed: true },
    { phase: "Phase 1", section: "Self Employed", title: "Self Employed — Overview (venit/cheltuieli/profit pe an fiscal)", doneOnSeed: true },
    { phase: "Phase 1", section: "Income", title: "Evidență venituri (CRUD, grupare pe an fiscal UK)", doneOnSeed: true },
    { phase: "Phase 1", section: "Expenses", title: "Evidență cheltuieli (CRUD, categorii, an fiscal UK)", doneOnSeed: true },
    { phase: "Phase 1", section: "Reports", title: "Raport de bază: venit vs cheltuieli pe lună", doneOnSeed: true },
    { phase: "Phase 1", section: "Dashboard", title: "Card-uri self-employed pe dashboard-ul principal (venit/cheltuieli YTD)" },
    { phase: "Phase 1", section: "Foundation", title: "Verifică auth/2FA după migrarea middleware.ts → proxy.ts (edge → Node.js runtime)", description: "Confirmă în producție că login-ul, redirect-ul /auth/totp și cookie-ul 2FA se comportă identic pe noul runtime Node.js al proxy.ts față de vechiul middleware.ts pe edge." },

    // --- Phase 2 ---
    { phase: "Phase 2", section: "Receipts", title: "Upload chitanțe (cameră telefon + fișier)" },
    { phase: "Phase 2", section: "Receipts", title: "Stocare Cloudflare R2 (original + preview)" },
    { phase: "Phase 2", section: "Receipts", title: "Metadate chitanțe în Neon (fără imagini în DB)" },
    { phase: "Phase 2", section: "Receipts", title: "Arhitectură OCR (Google Cloud Vision)" },
    { phase: "Phase 2", section: "Receipts", title: "Editare manuală date extrase din chitanță" },
    { phase: "Phase 2", section: "Receipts", title: "Buton opțional \"Analyze with AI\"" },
    { phase: "Phase 2", section: "Receipts", title: "Reguli merchant → categorie" },

    // --- Phase 3 ---
    { phase: "Phase 3", section: "Bank", title: "Import CSV extras bancar (format-agnostic)" },
    { phase: "Phase 3", section: "Bank", title: "Deduplicare tranzacții (hash rând)" },
    { phase: "Phase 3", section: "Bank", title: "Istoric batch-uri de import" },
    { phase: "Phase 3", section: "Bank", title: "Matching chitanță ↔ tranzacție bancară (retroactiv)" },

    // --- Phase 4 ---
    { phase: "Phase 4", section: "Tax", title: "Calculator taxe (Income Tax + Class 4 NI) — estimativ" },
    { phase: "Phase 4", section: "Tax", title: "Reguli fiscale centralizate pe an fiscal (lib/tax/rules)" },
    { phase: "Phase 4", section: "Tax", title: "Estimare taxă live din date reale (YTD + proiecție an)" },
    { phase: "Phase 4", section: "Tax", title: "Simulator SIPP / pensie privată" },

    // --- Phase 5 ---
    { phase: "Phase 5", section: "Vehicles", title: "Gestionare vehicule multiple" },
    { phase: "Phase 5", section: "Fuel", title: "Jurnal alimentări combustibil (MPG, cost/milă)" },
    { phase: "Phase 5", section: "Maintenance", title: "Mentenanță vehicul (status verde/galben/roșu)" },
    { phase: "Phase 5", section: "Documents", title: "Document vault (R2 + metadate Neon)" },
    { phase: "Phase 5", section: "Reminders", title: "Reminders / expirări (MOT, VST, asigurare etc.)" },
    { phase: "Phase 5", section: "Documents", title: "Politică retenție & ștergere (lifecycle sigur)" },

    // --- Phase 6 ---
    { phase: "Phase 6", section: "Vanguard", title: "Vanguard — intrare manuală / import extras" },
    { phase: "Phase 6", section: "Investments", title: "Investments Overview unificat (BTC + T212 + Vanguard)" },
    { phase: "Phase 6", section: "Goals", title: "Modul Goals (progres țintă financiară)" },

    // --- Later / cross-cutting ---
    { phase: "Later", section: "Bank", title: "Export contabil (CSV/ZIP per an fiscal)" },
    { phase: "Later", section: "Reports", title: "Rapoarte avansate (trend, top merchants, comparații)" },
];
