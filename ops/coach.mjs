// Outil coach — lit les séances et écrit les consignes, depuis le poste du coach.
// Clés lues dans .env.local (jamais versionné) : SUPABASE_URL, SUPABASE_SERVICE_KEY.
//
//   node ops/coach.mjs report            point complet des 28 derniers jours
//   node ops/coach.mjs report 60         sur 60 jours
//   node ops/coach.mjs notes             consignes actuellement affichées dans l'app
//   node ops/coach.mjs note "<exo>" "<texte>"   pose ou remplace une consigne
//   node ops/coach.mjs clear "<exo>"     retire une consigne
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* fichier absent : message plus bas */ }

const URL_ = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY;
if (!URL_ || !KEY) {
  console.error("Manque .env.local à la racine du projet, avec :\n  SUPABASE_URL=https://xxxx.supabase.co\n  SUPABASE_SERVICE_KEY=...");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rest(pathname, init = {}) {
  const r = await fetch(`${URL_}/rest/v1/${pathname}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

// Un seul athlète : on résout son compte automatiquement.
async function athleteId() {
  const r = await fetch(`${URL_}/auth/v1/admin/users?per_page=10`, { headers: H });
  const j = await r.json();
  const users = j.users || [];
  if (!users.length) throw new Error("Aucun compte créé pour l'instant : connecte-toi une fois dans l'app.");
  if (users.length > 1) console.error(`(${users.length} comptes, on prend le plus ancien : ${users[users.length - 1].email})`);
  return users[users.length - 1].id;
}

const fmtD = (d) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "2-digit" });
const fmtW = (w) => Number(w).toLocaleString("fr-FR");

async function report(days = 28) {
  const cut = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const rows = await rest(`workout_entry?day=gte.${cut}&select=exo,day,weight,reps,pain,comment&order=day.asc`);
  const notes = await rest(`session_note?day=gte.${cut}&select=day,session,note&order=day.asc`);
  const cks = await rest(`checkin?day=gte.${cut}&select=day,weight,adductor,lumbar,quad,wrist,note&order=day.asc`);
  if (cks.length) {
    console.log("POIDS ET DOULEURS (point du lundi)");
    for (const c of cks) {
      const b = [];
      if (c.weight !== null) b.push(fmtW(c.weight) + " kg");
      for (const [k, lbl] of [["adductor", "add"], ["lumbar", "lomb"], ["quad", "quad"], ["wrist", "poignet"]])
        if (c[k] !== null) b.push(`${lbl} ${c[k]}`);
      console.log(`- ${fmtD(c.day)} : ${b.join(" · ") || "vide"}${c.note ? " — " + c.note : ""}`);
    }
    // Tendance : utile pour juger la prise de masse et les tractions.
    const w = cks.filter((c) => c.weight !== null);
    if (w.length > 1) {
      const d = Number(w.at(-1).weight) - Number(w[0].weight);
      console.log(`  → ${d >= 0 ? "+" : ""}${fmtW(d.toFixed(1))} kg sur ${w.length} pesées\n`);
    } else console.log("");
  }
  const byDay = new Map();
  for (const r of rows) (byDay.get(r.day) || byDay.set(r.day, { ex: [], notes: [] }).get(r.day)).ex.push(r);
  for (const n of notes) if (n.note) (byDay.get(n.day) || byDay.set(n.day, { ex: [], notes: [] }).get(n.day)).notes.push(n);
  const days_ = [...byDay.keys()].sort();
  if (!days_.length) return console.log(`Aucune séance sur ${days} jours.`);
  console.log(`POINT COACH — ${days} derniers jours — ${rows.length} exercices enregistrés\n`);
  for (const d of days_) {
    console.log("== " + fmtD(d));
    for (const r of byDay.get(d).ex) {
      const bits = [];
      if (r.weight !== null) bits.push(fmtW(r.weight) + " kg");
      if (r.reps?.length) bits.push(r.reps.join("/") + " reps");
      if (r.pain !== null) bits.push("douleur " + r.pain + "/10");
      console.log(`- ${r.exo}${bits.length ? " : " + bits.join(" · ") : ""}${r.comment ? ` — « ${r.comment} »` : ""}`);
    }
    for (const n of byDay.get(d).notes) console.log(`> Bilan ${n.session} : ${n.note}`);
    console.log("");
  }
}

async function listNotes() {
  const rows = await rest("coach_note?select=exo,note,updated_at&order=updated_at.desc");
  if (!rows.length) return console.log("Aucune consigne active.");
  for (const r of rows) console.log(`- ${r.exo} : ${r.note}   (${r.updated_at.slice(0, 10)})`);
}

async function setNote(exo, note) {
  const user_id = await athleteId();
  await rest("coach_note?on_conflict=user_id,exo", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ user_id, exo, note }]),
  });
  console.log(`Consigne posée sur « ${exo} ». Elle s'affichera dans l'app à la prochaine synchro.`);
}

async function clearNote(exo) {
  await rest(`coach_note?exo=eq.${encodeURIComponent(exo)}`, { method: "DELETE" });
  console.log(`Consigne retirée de « ${exo} ».`);
}

const [cmd, a, b] = process.argv.slice(2);
try {
  if (cmd === "report") await report(a ? Number(a) : 28);
  else if (cmd === "notes") await listNotes();
  else if (cmd === "note" && a && b) await setNote(a, b);
  else if (cmd === "clear" && a) await clearNote(a);
  else console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 8).join("\n").replace(/^\/\/ ?/gm, ""));
} catch (e) {
  console.error("Erreur :", e.message);
  process.exit(1);
}
