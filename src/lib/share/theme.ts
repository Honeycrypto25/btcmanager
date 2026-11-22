/** Stylesheet of the public share page (inline <style>; the page's CSP allows inline styles only). */
export const SHARE_CSS = `
:root{color-scheme:dark;--bg:#07080b;--panel:#0f1217;--panel2:#12161c;--line:rgba(255,255,255,.08);--line2:rgba(255,255,255,.14);--fg:#eef1f5;--mut:#8b949e;--dim:#5d6671;--acc:#4ade80;--acc2:#34d399;--amb:#e8bc70;--blue:#7cc4ff;--red:#f87171}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;
background-image:radial-gradient(900px 480px at 8% -8%,rgba(74,222,128,.10),transparent 60%),radial-gradient(800px 460px at 100% 0%,rgba(124,196,255,.08),transparent 60%),radial-gradient(700px 500px at 50% 110%,rgba(232,188,112,.06),transparent 60%);background-attachment:fixed}
.wrap{max-width:1120px;margin:0 auto;padding:20px 18px 64px}
a{color:inherit;text-decoration:none}
.nav{position:sticky;top:0;z-index:5;margin:0 -18px 18px;padding:10px 18px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);background:rgba(7,8,11,.72);border-bottom:1px solid var(--line);display:flex;gap:6px;align-items:center;overflow-x:auto;white-space:nowrap}
.nav .brand{font-weight:700;letter-spacing:.02em;margin-right:10px;display:flex;align-items:center;gap:8px}
.nav .brand i{width:9px;height:9px;border-radius:50%;background:linear-gradient(135deg,var(--acc),var(--blue));box-shadow:0 0 12px rgba(74,222,128,.7)}
.nav a.l{color:var(--mut);font-size:12.5px;padding:5px 11px;border-radius:99px;border:1px solid transparent}
.nav a.l:hover{color:var(--fg);border-color:var(--line2);background:rgba(255,255,255,.04)}
.nav .live{margin-left:auto;display:flex;align-items:center;gap:7px;color:var(--mut);font-size:12px}
.nav .live b{width:7px;height:7px;border-radius:50%;background:var(--acc);box-shadow:0 0 0 0 rgba(74,222,128,.6);animation:pulse 2.2s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(74,222,128,.55)}70%{box-shadow:0 0 0 8px rgba(74,222,128,0)}100%{box-shadow:0 0 0 0 rgba(74,222,128,0)}}
.hero{position:relative;overflow:hidden;border-radius:26px;padding:28px;border:1px solid var(--line2);background:linear-gradient(160deg,rgba(255,255,255,.06),rgba(255,255,255,.015) 40%),var(--panel);box-shadow:0 30px 80px -30px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,.06)}
.hero:before{content:"";position:absolute;inset:-40% -10% auto auto;width:520px;height:520px;background:radial-gradient(circle,rgba(74,222,128,.18),transparent 65%);pointer-events:none}
.hero-top{display:flex;flex-wrap:wrap;gap:18px;align-items:center;justify-content:space-between;position:relative}
.ident{display:flex;align-items:center;gap:16px}
.badge{width:60px;height:60px;border-radius:18px;display:grid;place-items:center;font-weight:800;font-size:17px;letter-spacing:.02em;color:#04140b;background:linear-gradient(135deg,#86efac,#34d399 55%,#7cc4ff);box-shadow:0 10px 30px -8px rgba(52,211,153,.7),inset 0 1px 0 rgba(255,255,255,.5)}
h1{margin:0;font-size:28px;line-height:1.1;font-weight:750;letter-spacing:-.02em}
.sub{margin:5px 0 0;color:var(--mut);font-size:13px}
.price{text-align:right}.price .k{margin-bottom:2px}.price .big{font-size:34px;font-weight:750;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.chip{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;border:1px solid currentColor}
.chip.up{color:var(--acc);background:rgba(74,222,128,.08)}.chip.down{color:var(--red);background:rgba(248,113,113,.08)}.chip.flat{color:var(--mut)}
.hero-stats{position:relative;display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:12px;margin-top:24px}
.hs{border-radius:18px;padding:16px 18px;background:rgba(255,255,255,.035);border:1px solid var(--line)}
.hs .v{font-size:26px;font-weight:750;margin-top:4px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.hs.main{background:linear-gradient(150deg,rgba(74,222,128,.16),rgba(74,222,128,.03));border-color:rgba(74,222,128,.28)}
.hs.main .v{font-size:36px;color:var(--acc)}
.hs .s{color:var(--mut);font-size:12px;margin-top:5px}
.k{color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.09em;font-weight:600}
.section{margin-top:34px;scroll-margin-top:70px}
.section>h2{display:flex;align-items:center;gap:10px;font-size:13px;margin:0 0 12px;color:var(--mut);text-transform:uppercase;letter-spacing:.12em;font-weight:700}
.section>h2:before{content:"";width:18px;height:2px;border-radius:2px;background:linear-gradient(90deg,var(--acc),var(--blue))}
.grid{display:grid;gap:12px}.grid>*,.card,.section{min-width:0}.g4{grid-template-columns:repeat(4,1fr)}.g3{grid-template-columns:repeat(3,1fr)}.g2{grid-template-columns:repeat(2,1fr)}
.card{position:relative;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012)),var(--panel);border:1px solid var(--line);border-radius:20px;padding:18px;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
.card h3{font-size:15px;margin:0 0 3px;font-weight:650;letter-spacing:-.01em}
.note{color:var(--mut);font-size:12.5px;margin:0 0 14px}
.tile{display:flex;flex-direction:column;gap:2px;padding:16px;overflow:hidden;transition:border-color .2s,transform .2s}
.tile:hover{border-color:var(--line2);transform:translateY(-1px)}
.tile .v{font-size:23px;font-weight:700;letter-spacing:-.02em;margin-top:6px;font-variant-numeric:tabular-nums;line-height:1.1}
.tile .s{color:var(--mut);font-size:11.5px;margin-top:6px;line-height:1.35;min-height:1.35em}
.tile .spark{position:absolute;right:10px;top:12px;width:84px;height:24px;opacity:.9}
.tile.g .v{color:var(--acc)}.tile.a .v{color:var(--amb)}.tile.b .v{color:var(--blue)}
svg{width:100%;height:auto;display:block}.donut{max-width:190px;margin:0 auto}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:12px;color:var(--mut);font-size:12px}
.legend i,.dot{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:7px;vertical-align:-1px}
.dl{display:flex;flex-direction:column;gap:9px;justify-content:center}
.dl div{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;color:var(--mut)}
.dl b{color:var(--fg);font-variant-numeric:tabular-nums}
.split{display:grid;grid-template-columns:200px 1fr;gap:22px;align-items:center}
.open-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:12px}
.oo{padding:16px}.oo .row{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.oo .nm{font-weight:700;font-size:15px}.oo .age{color:var(--mut);font-size:12px}
.oo .kv{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0 14px}
.oo .kv div b{display:block;font-size:14px;font-variant-numeric:tabular-nums;margin-top:2px}
.bar{height:9px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden;position:relative}
.bar>i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#e8bc70,#4ade80);box-shadow:0 0 14px rgba(74,222,128,.45)}
.bar-l{display:flex;justify-content:space-between;color:var(--mut);font-size:11.5px;margin-top:7px}
.tw{overflow-x:auto;border-radius:14px}
table{width:100%;border-collapse:collapse;font-size:13px;min-width:1040px}
th{color:var(--mut);font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;text-align:left;padding:10px 12px;border-bottom:1px solid var(--line2);white-space:nowrap;font-weight:650;position:sticky;top:0;background:var(--panel2)}
td{padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap;font-variant-numeric:tabular-nums}
tbody tr:hover{background:rgba(255,255,255,.03)}
.pill{border:1px solid currentColor;border-radius:99px;padding:2px 9px;font-size:11px;font-weight:600}
.mtab{min-width:0;font-size:13px}.mtab th.r,.mtab td.r{text-align:right}.mtab tfoot td{border-top:1px solid var(--line2);border-bottom:0;font-weight:700;color:var(--fg)}.mtab tfoot tr.avg td{font-weight:400;color:var(--mut)}
.mt{margin-top:14px}.m{color:var(--mut)}.pos{color:var(--acc)}.neg{color:var(--red)}
.fr{position:absolute;opacity:0;pointer-events:none}
.chips{display:flex;flex-direction:column;gap:8px;margin:0 0 14px}.cg{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.cg .k{margin-right:6px}
.chips label{border:1px solid var(--line2);border-radius:99px;padding:4px 12px;font-size:12px;color:var(--mut);cursor:pointer;user-select:none;transition:all .15s}
.chips label:hover{color:var(--fg);background:rgba(255,255,255,.05)}
.ft{color:var(--dim);font-size:12px;text-align:center;margin-top:40px;line-height:1.7}
@media(max-width:900px){.hero-stats{grid-template-columns:1fr 1fr}.hs.main{grid-column:1/-1}.g4{grid-template-columns:repeat(2,1fr)}.g3{grid-template-columns:repeat(2,1fr)}.g2{grid-template-columns:1fr}.split{grid-template-columns:1fr}}
@media(max-width:560px){.wrap{padding:14px 12px 48px}.nav{margin:0 -12px 14px;padding:9px 12px}.hero{padding:20px 16px;border-radius:22px}h1{font-size:22px}.price{text-align:left}.price .big{font-size:28px}.g4,.g3{grid-template-columns:1fr 1fr}.hs.main .v{font-size:30px}.tile .v{font-size:20px}.tile .spark{display:none}}
.strike{display:grid;grid-template-columns:1fr 2.4fr;gap:22px}.srow{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px}.srow b{font-size:22px;font-variant-numeric:tabular-nums}
.strip{display:flex;gap:3px}.strip i{flex:1;height:34px;border-radius:4px}.strip.tall i{height:42px}.strike .s{color:var(--mut);font-size:11.5px;margin-top:7px}
.amb{color:var(--amb)}
.cmp{padding:14px 16px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.02)}.cmp-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.cmp-b{display:grid;grid-template-columns:104px 1fr 86px;gap:10px;align-items:center;margin-top:7px;font-size:12px}.cmp-b b{text-align:right;font-variant-numeric:tabular-nums}.cmp-l{color:var(--mut)}
.cmp-b.prev .bar>i{background:linear-gradient(90deg,#5d6671,#8b949e);box-shadow:none}
.splitc{margin-bottom:12px}
.pager{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 14px}.pager .k{margin-right:4px}
.pager label{min-width:30px;text-align:center;border:1px solid var(--line2);border-radius:10px;padding:4px 9px;font-size:12px;color:var(--mut);cursor:pointer;user-select:none}
.pager label:hover{color:var(--fg);background:rgba(255,255,255,.05)}.pager .m{margin-left:8px;font-size:12px}
@media(max-width:900px){.strike{grid-template-columns:1fr}}
@media(max-width:560px){.cmp-b{grid-template-columns:84px 1fr 70px}}
@media print{body{background:#fff;color:#000}.nav{display:none}}
`;
