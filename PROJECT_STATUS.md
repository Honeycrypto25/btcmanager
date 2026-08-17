# Evama.net / btcmanager — Project Status

This file is a living summary meant to let any new Claude session (or any
developer) pick up this project quickly without needing prior chat history.
Update it whenever a phase of work finishes. The in-app `/tasks` page is the
authoritative, granular roadmap tracker (backed by the `DevTask` table) —
this file is the higher-level narrative companion to it.

## What this is

A personal, multi-asset finance and life dashboard, live at **evama.net**.
Started as a Bitcoin portfolio tracker and grew into a much broader
platform: investments (BTC, Trading 212, Vanguard), UK self-employment
bookkeeping (income/expenses/receipts/bank/tax), vehicle & fuel tracking,
and a document vault with expiry reminders.

- **Repo:** `Honeycrypto25/btcmanager` (GitHub, public)
- **Deploy:** Vercel, auto-deploys `main` → production (evama.net)
- **Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript,
  Prisma 7 (`@prisma/adapter-pg`), Neon Postgres, NextAuth v4, Cloudflare
  R2 (file storage), Recharts (charts), Resend (email)
- **Build quirk:** `prisma db push --accept-data-loss` runs automatically
  as part of the Vercel `build` script, so additive schema changes deploy
  themselves — no manual migration step needed for new nullable columns.

## Modules (all live in production)

- **BTC** (`/btc`) — Bitcoin wallet tracking, the original feature.
- **Trading 212** (`/t212`) — live sync via official T212 API, daily cron.
- **Vanguard** (`/vanguard`) — manually-entered holdings (no public API).
- **Investments** (`/investments`) — unified overview of BTC + T212 +
  Vanguard, each in its own currency (never combined into one number).
- **Goals** (`/goals`) — simple progress-bar savings/investment goals.
- **Self Employed** (`/self-employed`) — UK sole-trader bookkeeping:
  - Income & Expenses ledgers, tax-year aware
  - **Receipts** (`/self-employed/receipts`) — photo/PDF upload to R2,
    live Google Cloud Vision OCR auto-fills merchant/amount/VAT/date/
    payment method; can be linked to a vehicle (fuel purchases); can be
    converted directly into an Expense (for cash purchases with no bank
    transaction)
  - **Bank** (`/self-employed/bank`) — CSV statement import (any bank,
    user maps columns), deterministic matching against receipts,
    transactions can be converted to Income/Expense or ignored; date
    range + description filter on the transactions list
  - **Tax** (`/self-employed/tax`) — Income Tax + Class 4 NI estimate
    (UK rates 2022-23 through 2026-27), SIPP contribution simulator
  - Accounting export (CSV/ZIP per tax year), advanced reports (top
    merchants, YoY comparison, trend)
- **Vehicles** (`/vehicles`) — fuel journal (MPG/cost-per-mile from
  consecutive full-tank fill-ups), maintenance records, a **Statistics**
  tab (weekly/monthly consumption & distance charts, MPG↔L/100km toggle,
  price evolution, cheapest-supplier ranking), fuel receipts without a
  mileage reading are still included with an estimated distance (from
  the vehicle's own average MPG, clearly labeled as an estimate).
- **Documents** (`/documents`) — general document vault (R2), retention
  policy + expiry badges, manual delete only.
- **Reminders** (`/reminders`) — expiry/renewal reminders (insurance,
  MOT, etc.), urgency-colored.
- **Tasks** (`/tasks`) — internal dev roadmap tracker (`DevTask` model),
  auto-seeds/advances status on page load; treat as the source of truth
  for "what phase are we in."

## Recent fixes (most recent session)

- Fixed OCR total-amount extraction on fuel receipts (was picking a
  pre-authorization hold amount instead of the real total); added a
  litres × price/litre cross-check specific to fuel receipts.
- OCR now also auto-fills litres in the vehicle-link section.
- Vehicle fuel stats now include receipts with no mileage reading
  (estimated distance from average MPG), instead of excluding them.
- Added receipt → expense conversion (`convertReceiptToExpense` /
  `undoReceiptExpenseConversion` in `actions/receipts.ts`), for cash
  purchases that never appear in a bank statement.
- Fixed that conversion throwing an uncaught error on a second attempt
  (double-click) — now idempotent, and returns a plain serializable
  object instead of a raw Prisma row with `Decimal` fields.
- Added a date-range + description search filter to the Bank
  Transactions view (`BankClient.tsx`), on top of the existing
  matched/possible/unmatched status filter.

## Known limitations / not yet done

- "Analyze with AI" on receipts is still a stub — needs an
  Anthropic/OpenAI API key to be wired up.
- Orca Whirlpools (Solana liquidity positions) was scoped early on but
  never implemented.
- No automated test suite; validation is eslint + manual review +
  reading Vercel's actual build/runtime logs (local `prisma
  generate`/`next build` type-checking is blocked in some sandboxed dev
  environments by a 403 fetching Prisma engine binaries — Vercel's build
  is the authoritative check in that case).

## Where to look for more detail

- `git log --oneline` — commit messages are written to be self-explanatory
  changelogs (context, root cause, what changed).
- `/tasks` in the running app — granular phase-by-phase status.
- `prisma/schema.prisma` — full data model.
