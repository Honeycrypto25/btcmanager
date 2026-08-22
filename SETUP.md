# Ghid de instalare — instanță proprie

Acest dashboard e conceput pentru **un singur "gospodărie"/deployment per persoană** —
conturi bancare, mașină, portofele BTC, boții DCA etc. sunt gândite ca fiind
ale unui singur utilizator (sau ale unei familii), nu multi-tenant între
persoane diferite. Dacă vrei să-l folosească și un prieten, cea mai simplă și
mai sigură variantă e ca **el să-și facă propria instanță separată** — cont
Vercel al lui, bază de date a lui, chei API ale lui. Nimic din ce faci tu nu
se amestecă cu ce face el, și nimeni nu vede cheile private ale celuilalt.

Ghidul de mai jos e scris pentru persoana care instalează (poate fi
prietenul tău, singur, pas cu pas) — durează 15-30 minute pentru
dashboard-ul de bază, plus câteva minute în plus per bot de crypto dacă vrea
și pe alea.

## 0. Ce ai nevoie înainte să începi

- Un cont **GitHub** (gratuit) — Vercel are nevoie de el ca să-ți cloneze
  propriul repo cu codul aplicației.
- Un cont **Vercel** (gratuit, te loghezi cu GitHub) — aici rulează
  aplicația.
- Un cont **Neon** (gratuit, [neon.tech](https://neon.tech)) — baza de date
  Postgres. Poate fi creat direct din Vercel, la pasul 2.
- Un cont **Resend** (gratuit, [resend.com](https://resend.com)) — trimite
  email-ul cu codul de login. Fără el nu te poți loga în aplicație, deci nu e
  opțional.

Notă despre planul Vercel: aplicația are 6 job-uri programate (cron) —
sincronizare T212, prețuri Vanguard, rapoarte, plus boții DCA. De la
20 ianuarie 2026, planul gratuit **Hobby** permite până la 100 de cron-uri
per proiect — nu mai e o problemă de număr. Singura restricție rămasă pe
Hobby: fiecare cron poate rula cel mult o dată pe zi, cu precizia garantată
doar la nivel de oră (nu la minutul exact) — toate cele 6 din acest proiect
sunt deja o dată pe zi sau mai rar, deci se încadrează fără probleme, fără
să ai nevoie de planul Pro.

## 1. Deploy inițial

Apasă butonul de mai jos (sau, dacă instalezi de pe alt calculator, folosește
link-ul din README.md al repo-ului):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FHoneycrypto25%2Fbtcmanager&project-name=my-portfolio-dashboard&repository-name=my-portfolio-dashboard)

Asta îți clonează codul într-un repo NOU pe contul tău de GitHub (separat
total de originalul) și pornește crearea unui proiect Vercel din el. La acest
prim pas, Vercel o să-ți ceară să confirmi importul — nu apăsa încă
"Deploy", vezi pasul 2 mai jos întâi, ca să ai baza de date gata.

## 2. Adaugă baza de date (Neon)

În ecranul de configurare a proiectului, la secțiunea **Storage**:
Create Database → alege **Neon (Postgres)** → creează. Vercel injectează
automat variabila `DATABASE_URL` — nu trebuie s-o copiezi manual.

(Dacă preferi un cont Neon separat de al tău, poți crea baza de date direct
pe [neon.tech](https://neon.tech) și lipi connection string-ul manual în
`DATABASE_URL`.)

## 3. Variabilele de mediu

Deschide `.env.example` din repo — are fiecare variabilă explicată, cu
obligatorii vs. opționale și link-uri unde le obții. Pe scurt, minimul ca
aplicația să pornească și să te poți loga:

| Variabilă | Ce e | De unde |
|---|---|---|
| `DATABASE_URL` | conexiunea la Postgres | automat, de la Neon (pasul 2) |
| `NEXTAUTH_SECRET` | secret pentru sesiuni | generezi tu: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | URL-ul public al site-ului | ex: `https://numele-proiectului.vercel.app` |
| `ADMIN_EMAILS` | email-urile permise să se logheze | emailul tău, separat prin virgulă dacă sunt mai multe |
| `RESEND_API_KEY` | trimite codul OTP de login | din dashboard-ul Resend, gratuit |
| `CRON_SECRET` | protejează job-urile automate | generezi tu: `openssl rand -hex 32` |

Restul (boții DCA, OCR chitanțe, R2, T212, prețuri crypto) sunt opționale —
adaugă-le doar pentru funcțiile pe care chiar vrei să le folosești. Vezi
`.env.example` pentru lista completă cu explicații.

Adaugă-le în Vercel: **Project → Settings → Environment Variables**, apoi
**Deployments → ⋯ → Redeploy** ca să le preia.

## 4. Primul login

Mergi pe URL-ul deployment-ului tău. Introdu emailul pe care l-ai pus în
`ADMIN_EMAILS`, primești un cod pe email (prin Resend) în câteva secunde,
îl introduci și ești înăuntru.

Dacă primești "Access Denied" — verifică exact ce ai scris în
`ADMIN_EMAILS` (fără spații, litere mici) și că ai redeployat după ce ai
adăugat variabila.

## 5. (Opțional) Boții DCA — Solana și/sau Base

**Foarte important: creează portofele NOI, dedicate exclusiv botului.**
Niciodată cheia privată a unui portofel personal existent — dacă ceva merge
prost în cod sau se scurge o variabilă de mediu, vrei ca expunerea să fie
limitată la ce ai pus special în bot, nu la toate economiile tale.

- **Solana**: generează un portofel nou (Phantom → Add Wallet → New Wallet),
  exportă cheia privată, pune-o în `SOLANA_PRIVATE_KEY`. RPC de la Alchemy
  sau Helius (tier gratuit e suficient). Trimite câteva zeci de USDC în
  portofel ca să pornească DCA-ul.
- **Base**: la fel, portofel EVM nou (poate fi tot din Phantom sau MetaMask),
  cheia în `BASE_PRIVATE_KEY`, RPC de la Alchemy/Infura, plus o cheie API de
  la [portal.1inch.dev](https://portal.1inch.dev) în `ONEINCH_API_KEY`.
  Trimite USDC-on-Base în portofel.

După ce pui variabilele, redeployează, apoi din aplicație: `/solana` sau
`/base` → configurează suma, intervalul, procentul de profit țintă →
activează.

## 6. Verificare finală

- [ ] Te poți loga cu emailul din `ADMIN_EMAILS`
- [ ] `/base/stats` și `/solana/stats` se încarcă fără eroare (chiar dacă
      botul nu e activat încă)
- [ ] Dacă ai activat vreun bot: portofelul are fonduri, iar
      "Verifică acum" / "Rulează acum" nu dă eroare
- [ ] Vercel → Project → Settings → Cron Jobs arată job-urile active (nu
      "skipped" din cauza limitei de plan)

## Ce NU trebuie să faci

Nu-i trimite niciodată cheile lui private (portofel, API-uri) — el le pune
direct în Vercel-ul lui, tu nu ai nevoie să le vezi ca să-l ajuți. Dacă are
o eroare, cere-i un screenshot al mesajului, nu al valorilor din
Environment Variables.
