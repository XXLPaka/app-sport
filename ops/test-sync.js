// Test de bout en bout de la synchro, contre le vrai projet Supabase.
// Cree un compte de test par l'administration, le supprime a la fin.
//   node ops/test-sync.js
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("C:/Boulot/Lupio/Lupio Claude/lupio/node_modules/playwright");
const ROOT = path.resolve(__dirname, "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".png": "image/png" };

const env = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2];
}
const URL_ = env.SUPABASE_URL, SVC = env.SUPABASE_SERVICE_KEY;
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
const MAIL = "e2e-appsport@mailinator.com", PASS = "test-e2e-" + Date.now();
let UID = null, fails = 0;
const mine = p => p + (p.includes("?") ? "&" : "?") + "user_id=eq." + UID;
const waitSynced = (p, ms) => p.waitForFunction(
  () => { const t = document.getElementById("cl-state").textContent; return t.includes("Synchronisé") && !t.includes("envoyer"); },
  null, { timeout: ms || 40000 });
const until = async (fn, ms = 30000) => {          // attend que le serveur ait vraiment la donnee
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await new Promise(r => setTimeout(r, 1000));
  }
};
const check = (l, c, x) => { console.log((c ? "  OK   " : "  FAIL ") + l + (x !== undefined ? "  → " + JSON.stringify(x) : "")); if (!c) fails++; };
const rest = async (p, init = {}) => {
  const r = await fetch(`${URL_}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text(); if (!r.ok) throw new Error(r.status + " " + t); return t ? JSON.parse(t) : null;
};
async function wipeTestUser() {
  const j = await (await fetch(`${URL_}/auth/v1/admin/users?per_page=50`, { headers: H })).json();
  for (const u of (j.users || [])) if (u.email === MAIL)
    await fetch(`${URL_}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: H });
}
async function createTestUser() {            // les inscriptions publiques sont fermees
  const j = await (await fetch(`${URL_}/auth/v1/admin/users`, {
    method: "POST", headers: H, body: JSON.stringify({ email: MAIL, password: PASS, email_confirm: true }),
  })).json();
  if (!j.id) throw new Error("compte de test impossible : " + JSON.stringify(j).slice(0, 200));
  UID = j.id;
}

const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await wipeTestUser(); await createTestUser();
  await new Promise(r => srv.listen(8766, r));
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const attendu = /favicon|ERR_INTERNET_DISCONNECTED/;      // l'etape 3 coupe le reseau expres
  page.on("console", m => { if (m.type() === "error" && !attendu.test(m.text())) errors.push(m.text()); });
  await page.goto("http://localhost:8766/");
  await page.waitForFunction(() => window.supabase !== undefined, null, { timeout: 20000 });

  // Historique deja saisi avant la synchro, sous l'ANCIEN nom d'exo : il doit etre migre puis envoye.
  await page.evaluate(() => localStorage.setItem("bloc2-loads", JSON.stringify({
    v: 2,
    loads: { "Leg curl (ph.1) / RDL technique (ph.2)": [{ d: "2026-10-16", w: 40, rs: [10, 10, 10], c: "avant renommage" }] },
    sess: { "2026-10-16|Vendredi": { note: "Séance correcte" } },
  })));
  await page.reload();
  await page.waitForFunction(() => window.supabase !== undefined, null, { timeout: 20000 });

  console.log("\n[1] Connexion et premiere montee");
  await page.fill("#cl-mail", MAIL); await page.fill("#cl-pass", PASS);
  await page.click("#cl-login");
  await page.waitForFunction(() => document.getElementById("cl-state").textContent.includes("Synchronisé"), null, { timeout: 25000 }).catch(() => {});
  check("connecte et synchronise", (await page.textContent("#cl-state")).includes("Synchronisé"), await page.textContent("#cl-state"));
  const old = await rest(mine("workout_entry?select=exo,weight,reps,comment"));
  check("historique migre puis envoye sous le nouveau nom", old.length === 1 && old[0].exo === "RDL barre" && old[0].weight == 40, old[0]);

  console.log("\n[2] Seance saisie puis remontee automatique");
  const info = await page.evaluate(() => {
    const s = SESSIONS.find(x => x.id === "lundi"), st = buildSteps(s);
    const i = st.findIndex(x => x.e.prog === "load" && (x.e.sets || 1) >= 2);
    return { exo: st[i].e.n, idx: i };
  });
  await page.evaluate(i => { openList(SESSIONS.find(s => s.id === "lundi")); startAt(i); }, info.idx);
  await page.fill("#ld-val", "45"); await page.dispatchEvent("#ld-val", "input");
  await page.fill("#rp-val", "5"); await page.dispatchEvent("#rp-val", "input");
  await page.click("#nt-toggle");
  await page.fill("#nt-pain", "1"); await page.dispatchEvent("#nt-pain", "input");
  await page.fill("#nt-com", "Test e2e"); await page.dispatchEvent("#nt-com", "input");
  await page.click("#t-btn");
  let rows = await until(async () => {
    const r = await rest(mine(`workout_entry?exo=eq.${encodeURIComponent(info.exo)}&select=weight,reps,pain,comment`));
    return r.length === 1 && r[0].comment ? r : null;
  });
  check("charge, reps, douleur et commentaire arrives",
    !!(rows && rows[0].weight == 45 && JSON.stringify(rows[0].reps) === "[5]" && rows[0].pain === 1 && /Test e2e/.test(rows[0].comment)), rows && rows[0]);

  console.log("\n[3] Salle sans reseau puis rattrapage");
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.click("#rp-plus");
  await page.waitForTimeout(1500);
  check("l'app signale le retard", (await page.textContent("#cl-state")).toLowerCase().includes("hors ligne"), await page.textContent("#cl-state"));
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  rows = await until(async () => {
    const r = await rest(mine(`workout_entry?exo=eq.${encodeURIComponent(info.exo)}&select=reps`));
    return r[0] && JSON.stringify(r[0].reps) === "[6]" ? r : null;
  });
  check("saisie hors ligne rattrapee", !!rows, rows && rows[0].reps);
  await waitSynced(page);
  check("etat revenu a synchronise", (await page.textContent("#cl-state")).includes("Synchronisé"), await page.textContent("#cl-state"));

  console.log("\n[4] Consigne du coach et point de la semaine");
  await rest("coach_note?on_conflict=user_id,exo", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ user_id: UID, exo: info.exo, note: "CONSIGNE DE TEST e2e." }]),
  });
  await page.evaluate(() => show("home"));
  for (const [id, val] of [["ck-wt", "77.5"], ["ck-ad", "1"], ["ck-lb", "2"], ["ck-qd", "0"], ["ck-wr", "0"]]) {
    await page.fill("#" + id, val); await page.dispatchEvent("#" + id, "input");
  }
  await page.click("#cl-sync");
  const ck = await until(async () => {
    const r = await rest(mine("checkin?select=day,weight,lumbar"));
    return r.length === 1 ? r : null;
  });
  check("point de la semaine arrive", !!(ck && ck[0].weight == 77.5 && ck[0].lumbar === 2), ck && ck[0]);
  await page.evaluate(i => { openList(SESSIONS.find(s => s.id === "lundi")); startAt(i); }, info.idx);
  check("consigne du coach affichee dans l'exo", (await page.textContent("#coachbox")).includes("CONSIGNE DE TEST"), await page.textContent("#coachbox"));

  console.log("\n[5] Nouveau telephone");
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p2 = await ctx2.newPage();
  p2.on("pageerror", e => errors.push("p2: " + e.message));
  await p2.goto("http://localhost:8766/");
  await p2.waitForFunction(() => window.supabase !== undefined, null, { timeout: 20000 });
  await p2.fill("#cl-mail", MAIL); await p2.fill("#cl-pass", PASS);
  await p2.click("#cl-login");
  await p2.waitForFunction(() => document.getElementById("cl-state").textContent.includes("Synchronisé"), null, { timeout: 25000 }).catch(() => {});
  const back = await p2.evaluate(n => ({ e: DB.loads[n], rdl: DB.loads["RDL barre"], ck: DB.check[weekKey()] }), info.exo);
  check("seance recuperee", !!(back.e && back.e[0].w === 45 && back.e[0].c === "Test e2e"), back.e);
  check("historique migre recupere", !!(back.rdl && back.rdl[0].w === 40), back.rdl);
  check("point de la semaine recupere", !!(back.ck && back.ck.wt === 77.5), back.ck);

  console.log("\nErreurs JS console :", errors.length ? errors : "aucune");
  if (errors.length) fails++;
  await browser.close(); srv.close();
  await wipeTestUser();
  console.log("Compte de test supprime.");
  console.log(fails ? fails + " ÉCHEC(S)" : "TOUT EST VERT");
  process.exit(fails ? 1 : 0);
})().catch(async e => { console.error(e); try { await wipeTestUser(); } catch {} srv.close(); process.exit(2); });
