// Tests de l'app, hors ligne : durees de seance, conseil de charge, saisie, migration.
//   node ops/test-app.js
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("C:/Boulot/Lupio/Lupio Claude/lupio/node_modules/playwright");
const ROOT = path.resolve(__dirname, ".."), OUT = path.join(ROOT, "ops");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".png": "image/png" };
let fails = 0;
const check = (l, c, x) => { console.log((c ? "  OK   " : "  FAIL ") + l + (x !== undefined ? "  → " + JSON.stringify(x) : "")); if (!c) fails++; };

const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => srv.listen(8767, r));
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/favicon|supabase|ERR_/.test(m.text())) errors.push(m.text()); });
  await page.goto("http://localhost:8767/");

  console.log("\n[1] Duree des seances (45 min annonces)");
  const durs = await page.evaluate(() => SESSIONS.filter(s => s.tag === "gym").map(s => {
    let t = 0;
    buildSteps(s).forEach(x => { t += (x.e.work ? x.e.work * (x.e.perSide ? 2 : 1) : (x.e.n === "Échauffement" ? 190 : 40)) + x.rest; });
    return { nom: s.name.split(" —")[0], min: Math.round(t / 60) };
  }));
  durs.forEach(d => check(`${d.nom} : ${d.min} min`, d.min <= 45, d.min));

  console.log("\n[2] Conseil de charge");
  await page.evaluate(() => { window.advise_ = advise; });
  const advise = (exo, rows) => page.evaluate(([n, rows]) => {
    const days = ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22"];
    DB.loads[n] = rows.map((r, i) => Object.assign({ d: days[days.length - rows.length + i] }, r));
    let e = null;
    SESSIONS.forEach(s => s.blocks.forEach(b => b.exos.forEach(x => { if (x.n === n) e = x; })));
    if (!e) return { t: "EXO INTROUVABLE: " + n, k: "?" };
    const a = advise_(e);
    return { t: a && a.t, k: a && a.k, s: a && a.s };
  }, [exo, rows]);

  let r;
  r = await advise("Squat barre", [{ w: 40, rs: [5, 5, 5, 5], p: 0 }]);
  check("force 4x5 bouclees -> +2,5 kg", r.k === "up" && /42,5 kg/.test(r.t), r.t);
  r = await advise("Squat barre", [{ w: 40, rs: [5, 5, 5, 4] }]);
  check("une serie ratee -> meme charge", r.k === "hold" && /40 kg/.test(r.t), r.t);
  r = await advise("Hip thrust lourd", [{ w: 60, rs: [8, 8, 8, 8] }]);
  check("haut de fourchette 6-8 -> +2,5 kg", r.k === "up" && /62,5 kg/.test(r.t), r.t);
  r = await advise("Hip thrust lourd", [{ w: 60, rs: [6, 6, 6, 6] }]);
  check("bas de fourchette -> on monte les reps", r.k === "hold" && /6-8/.test(r.s), r.s);
  r = await advise("Hip thrust lourd", [{ w: 60, rs: [8, 8, 8, 8], p: 5 }]);
  check("douleur orange -> -20 % malgre la cible bouclee", r.k === "down" && /48 kg/.test(r.t), r.t);
  r = await advise("Hip thrust lourd", [{ w: 60, rs: [7, 7], p: 7 }]);
  check("douleur rouge -> stop et consultation", r.k === "down" && /consultation/.test(r.s), r.t);
  r = await advise("Box jump", [{ rs: [3, 3, 3, 3] }]);
  check("explosivite -> progression en hauteur", r.k === "hold" && /hauteur de la box/.test(r.s), r.t);
  r = await advise("Med ball rotation", [{ rs: [5, 5, 5, 5, 5] }]);
  check("med ball -> on cherche la vitesse", r.k === "hold" && /VITESSE/.test(r.s), r.t);
  r = await advise("Pronation lourde (kiné)", [{ w: 8, rs: [10, 10, 10] }]);
  check("exo kine -> jamais de course a la charge", r.k === "hold" && /Qualité/.test(r.t), r.t);
  r = await advise("Tractions volume", [{ w: 0, rs: [10, 10, 10, 10] }]);
  check("poids de corps boucle -> ajoute une rep", r.k === "up" && /1 rep/.test(r.t), r.t);
  r = await advise("Tractions lestées", [{ w: 14.4, rs: [5, 5, 5, 5, 5] }]);
  check("tractions lestees 5x5 -> +1,25 kg", r.k === "up" && /15,7 kg/.test(r.t), r.t);
  r = await advise("RDL barre", [{ w: 50, rs: [8, 8, 8, 8] }]);
  check("RDL renomme, fourchette bouclee -> +2,5 kg", r.k === "up" && /52,5 kg/.test(r.t), r.t);
  r = await advise("Rowing appuyé", [{ w: 24, rs: [7, 7, 7, 7] }, { w: 24, rs: [7, 6, 7, 7] }, { w: 24, rs: [7, 7, 6, 7] }]);
  check("3 seances bloquees -> -10 %", r.k === "down" && /21,5 kg/.test(r.t), r.t);
  r = await advise("Rowing appuyé", [{ w: 24 }]);
  check("reps non notees -> l app le reclame", r.k === "info" && /Note tes reps/.test(r.t), r.t);

  console.log("\n[3] Migration des exos renommes (Bloc 2 -> Bloc 3)");
  await page.evaluate(() => localStorage.setItem("bloc2-loads", JSON.stringify({
    v: 2,
    loads: {
      "Leg curl (ph.1) / RDL technique (ph.2)": [{ d: "2026-10-16", w: 40, rs: [10, 10, 10] }],
      "Chop câble (ph.2) / Pallof marché (ph.1)": [{ d: "2026-10-02", w: 23 }],
    },
    sess: {}, coach: { "Leg curl (ph.1) / RDL technique (ph.2)": { note: "consigne historique" } },
  })));
  await page.reload();
  const mig = await page.evaluate(() => ({
    rdl: DB.loads["RDL barre"], chop: DB.loads["Chop câble"],
    vieux: Object.keys(DB.loads).filter(k => /ph\.1/.test(k)).length,
    coach: DB.coach["RDL barre"] && DB.coach["RDL barre"].note,
  }));
  check("historique du RDL repris sous le nouveau nom", !!(mig.rdl && mig.rdl[0].w === 40), mig.rdl);
  check("historique du chop repris", !!(mig.chop && mig.chop[0].w === 23), mig.chop);
  check("plus aucun ancien nom", mig.vieux === 0, mig.vieux);
  check("consigne du coach suivie", mig.coach === "consigne historique", mig.coach);

  console.log("\n[4] Saisie pendant la seance et persistance");
  await page.evaluate(() => { localStorage.removeItem("bloc2-loads"); });
  await page.reload();
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
  await page.fill("#nt-com", "Test local"); await page.dispatchEvent("#nt-com", "input");
  await page.waitForTimeout(900);
  await page.reload();
  const back = await page.evaluate(n => DB.loads[n], info.exo);
  check("charge, reps, douleur et commentaire conserves",
    !!(back && back[0].w === 45 && JSON.stringify(back[0].rs) === "[5]" && back[0].p === 1 && back[0].c === "Test local"), back && back[0]);

  console.log("\n[5] Affichage de la reco dans la seance");
  await page.evaluate(() => { DB.loads["Hip thrust lourd"] = [{ d: "2026-10-22", w: 60, rs: [8, 8, 8, 8] }]; });
  await page.evaluate(() => openList(SESSIONS.find(s => s.id === "lundi")));
  check("fleche de progression dans la liste", (await page.innerHTML("#l-exos")).includes('class="up">↑'));
  const i2 = await page.evaluate(() => steps.findIndex(s => s.e.n === "Hip thrust lourd"));
  await page.evaluate(i => startAt(i), i2);
  check("encadre visible et vert", (await page.getAttribute("#recobox", "class")).includes("up"));
  check("texte de la reco", (await page.textContent("#recobox")).includes("62,5 kg"), await page.textContent("#recobox"));
  await page.screenshot({ path: path.join(OUT, "apercu-reco.png"), fullPage: true });

  console.log("\nErreurs JS console :", errors.length ? errors : "aucune");
  if (errors.length) fails++;
  await browser.close(); srv.close();
  console.log(fails ? "\n" + fails + " ÉCHEC(S)" : "\nTOUT EST VERT");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); srv.close(); process.exit(2); });
