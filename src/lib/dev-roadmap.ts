/**
 * Static definition of the "Personal Finance & Life Dashboard" build roadmap.
 * This is the source of truth used to seed the DevTask table (see
 * actions/dev-tasks.ts). Editing this file and redeploying adds any new
 * items to the /tasks page.
 *
 * `doneOnSeed: true` marks items that are implemented in the current
 * codebase. On every /tasks page load, ensureRoadmapSeeded() both creates
 * any missing rows AND advances any existing row from PLANNED/IN_PROGRESS
 * to DONE if its item is now flagged doneOnSeed here — so flipping this
 * flag on later (once a feature ships) is enough to sync the page, no
 * manual click-through needed. It never reverts a DONE row and never
 * touches items that aren't flagged doneOnSeed, so it can't undo a manual
 * status change made from the UI.
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
    { phase: "Phase 1", section: "Dashboard", title: "Card-uri self-employed pe dashboard-ul principal (venit/cheltuieli YTD)", doneOnSeed: true },
    { phase: "Phase 1", section: "Foundation", title: "Verifică auth/2FA după migrarea middleware.ts → proxy.ts (edge → Node.js runtime)", description: "Confirmă în producție că login-ul, redirect-ul /auth/totp și cookie-ul 2FA se comportă identic pe noul runtime Node.js al proxy.ts față de vechiul middleware.ts pe edge.", doneOnSeed: true },

    // --- Phase 2 ---
    { phase: "Phase 2", section: "Receipts", title: "Upload chitanțe (cameră telefon + fișier)", doneOnSeed: true },
    { phase: "Phase 2", section: "Receipts", title: "Stocare Cloudflare R2 (original privat, URL semnat)", doneOnSeed: true },
    { phase: "Phase 2", section: "Receipts", title: "Generează preview .webp pentru chitanțe HEIC (fix: iPhone nu se afișa în browser)", doneOnSeed: true },
    { phase: "Phase 2", section: "Receipts", title: "Generează preview .webp și pentru JPEG/PNG (optimizare dimensiune, opțional)", doneOnSeed: true },
    { phase: "Phase 2", section: "Receipts", title: "Metadate chitanțe în Neon (fără imagini în DB)", doneOnSeed: true },
    { phase: "Phase 2", section: "Receipts", title: "Arhitectură OCR (câmpuri DB + buton UI, fără provider live)", doneOnSeed: true },
    { phase: "Phase 2", section: "Receipts", title: "Activează OCR live (Google Cloud Vision)", description: "Necesită proiect Google Cloud cu Vision API activat + cheie service account. Până atunci, butonul „Rulează OCR” arată un mesaj clar și utilizatorul completează manual." },
    { phase: "Phase 2", section: "Receipts", title: "Editare manuală date extrase din chitanță", doneOnSeed: true },
    { phase: "Phase 2", section: "Receipts", title: "Buton opțional \"Analyze with AI\" (arhitectură, fără provider live)", doneOnSeed: true },
    { phase: "Phase 2", section: "Receipts", title: "Activează Analyze with AI live", description: "Necesită o cheie API (ex. Anthropic/OpenAI) configurată doar server-side." },
    { phase: "Phase 2", section: "Receipts", title: "Reguli merchant → categorie", doneOnSeed: true },

    // --- Phase 3 ---
    { phase: "Phase 3", section: "Bank", title: "Import CSV extras bancar (format-agnostic, mapare coloane manuală)", doneOnSeed: true },
    { phase: "Phase 3", section: "Bank", title: "Deduplicare tranzacții (hash rând per utilizator)", doneOnSeed: true },
    { phase: "Phase 3", section: "Bank", title: "Istoric batch-uri de import", doneOnSeed: true },
    { phase: "Phase 3", section: "Bank", title: "Matching chitanță ↔ tranzacție bancară (retroactiv, ambele direcții)", doneOnSeed: true },
    { phase: "Phase 3", section: "Bank", title: "UI confirmare/respingere potriviri sugerate", doneOnSeed: true },

    // --- Phase 4 ---
    { phase: "Phase 4", section: "Tax", title: "Calculator taxe (Income Tax + Class 4 NI) — estimativ", doneOnSeed: true },
    { phase: "Phase 4", section: "Tax", title: "Reguli fiscale centralizate pe an fiscal (lib/tax/rules)", doneOnSeed: true },
    { phase: "Phase 4", section: "Tax", title: "Estimare taxă live din date reale (YTD + proiecție an)", doneOnSeed: true },
    { phase: "Phase 4", section: "Tax", title: "Simulator SIPP / pensie privată", doneOnSeed: true },

    // --- Phase 5 ---
    { phase: "Phase 5", section: "Vehicles", title: "Gestionare vehicule multiple", doneOnSeed: true },
    { phase: "Phase 5", section: "Fuel", title: "Jurnal alimentări combustibil (MPG, cost/milă)", doneOnSeed: true },
    { phase: "Phase 5", section: "Maintenance", title: "Mentenanță vehicul (status verde/galben/roșu)", doneOnSeed: true },
    { phase: "Phase 5", section: "Documents", title: "Document vault (R2 + metadate Neon)", doneOnSeed: true },
    { phase: "Phase 5", section: "Reminders", title: "Reminders / expirări (MOT, VST, asigurare etc.)", doneOnSeed: true },
    { phase: "Phase 5", section: "Documents", title: "Politică retenție & ștergere (lifecycle sigur)" },

    // --- Phase 6 ---
    { phase: "Phase 6", section: "Vanguard", title: "Vanguard — intrare manuală / import extras", doneOnSeed: true },
    { phase: "Phase 6", section: "Investments", title: "Investments Overview unificat (BTC + T212 + Vanguard)", doneOnSeed: true },
    { phase: "Phase 6", section: "Goals", title: "Modul Goals (progres țintă financiară)", doneOnSeed: true },

    // --- Later / cross-cutting ---
    { phase: "Later", section: "Bank", title: "Export contabil (CSV/ZIP per an fiscal)", doneOnSeed: true },
    { phase: "Later", section: "Reports", title: "Rapoarte avansate (trend, top merchants, comparații)", doneOnSeed: true },
    { phase: "Later", section: "Bank", title: "Conversie tranzacție bancară → venit/cheltuială", description: "Buton pe fiecare tranzacție din tab-ul Tranzacții pentru a o marca drept venit sau cheltuială de afaceri (sau a o ignora, dacă e personală) — creează automat rândul corespunzător în Income/Expenses, în loc de introducere manuală separată.", doneOnSeed: true },
    { phase: "Later", section: "Vehicles", title: "Leagă chitanțele de un vehicul + kilometraj", description: "Pe o chitanță (mai ales cele de combustibil) — posibilitatea de a selecta vehiculul și a introduce kilometrajul citit la momentul respectiv, astfel încât graficele de consum (MPG, cost/milă) să poată folosi și chitanțele încărcate, nu doar înregistrările manuale din jurnalul de combustibil al vehiculului. Receipt.vehicleId există deja în schemă (rezervat din Phase 2), doar fără FK activ către Vehicle." },
    { phase: "Later", section: "Receipts", title: "Conversie/compresie poze telefon la upload, pentru economie de spațiu R2", description: "Fotografiile de pe iPhone (HEIC) și pozele JPEG mari ocupă mult spațiu în timp. De explorat: conversie/compresie la upload (nu doar generarea unui preview .webp în plus, ca acum) — implică o decizie despre cum se împacă cu regula actuală „originalul nu se suprascrie niciodată\" (ex. compresie înainte de prima salvare, cu avertisment clar în UI, vs. păstrarea originalului needitat)." },
];
