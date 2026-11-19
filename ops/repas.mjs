// Modèle de calcul nutritionnel. Claude lit les repas dictés, les traduit en
// lignes { aliment, quantité }, et ce script fait l'arithmétique : pas d'erreur
// de calcul, et le même barème d'une semaine à l'autre.
//
//   node ops/repas.mjs liste [jours]     repas dictés, bruts, à traduire
//   node ops/repas.mjs calc <fichier>    totaux, moyennes, entretien, ajustement
//   node ops/repas.mjs table [filtre]    la table d'aliments disponible
//
// Format attendu par « calc » (grammes, ou nombre de pièces si l'aliment est « par pièce ») :
//   { "2026-11-23": { "midi":  [["pates_crues", 150], ["huile", 10]],
//                     "soir":  [["poulet_blanc", 200]],
//                     "reste": [["whey_nutrimuscle", 1]] } }
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REF = JSON.parse(fs.readFileSync(path.join(ROOT, "ops", "nutrition.json"), "utf8"));
const env = {};
try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* pas de clés : seules « calc » hors poids et « table » fonctionnent */ }

const H = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` };
async function rest(p) {
  if (!env.SUPABASE_URL) throw new Error("Manque .env.local");
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${p}`, { headers: H });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t}`);
  return t ? JSON.parse(t) : [];
}

const n0 = (x) => Math.round(x);
const n1 = (x) => Number(x).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
// Les kg/semaine se jouent au centième : 0,25 et 0,35 ne doivent pas s'afficher pareil.
const n2 = (x) => (Math.abs(x) < 0.005 ? 0 : Number(x)).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signe = (x) => (Math.abs(x) < 0.005 ? "" : x > 0 ? "+" : "");
const fmtD = (d) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });

// ── Repas bruts, tels que dictés ────────────────────────────────────────────
async function liste(jours = 7) {
  const cut = new Date(Date.now() - jours * 864e5).toISOString().slice(0, 10);
  const rows = await rest(`meal?day=gte.${cut}&select=day,lunch,dinner,extras&order=day.asc`);
  if (!rows.length) return console.log(`Aucun repas dicté sur ${jours} jours.`);
  for (const r of rows) {
    console.log("== " + fmtD(r.day) + "  (" + r.day + ")");
    if (r.lunch) console.log("  Midi  : " + r.lunch);
    if (r.dinner) console.log("  Soir  : " + r.dinner);
    if (r.extras) console.log("  Reste : " + r.extras);
    console.log("");
  }
  const vides = jours - rows.length;
  if (vides > 0) console.log(`(${rows.length} jours dictés sur ${jours})`);
}

// ── Calcul ──────────────────────────────────────────────────────────────────
function ligne(cle, q) {
  const a = REF.aliments[cle];
  if (!a) {
    const proches = Object.keys(REF.aliments).filter((k) => k.includes(cle.slice(0, 4))).slice(0, 5);
    throw new Error(`Aliment inconnu : « ${cle} »` + (proches.length ? `. Proches : ${proches.join(", ")}` : ""));
  }
  const f = a.par === "piece" ? q : q / 100;
  return { kcal: a.kcal * f, p: a.p * f, g: a.g * f, l: a.l * f };
}

async function calc(fichier) {
  const data = JSON.parse(fs.readFileSync(fichier, "utf8"));
  const jours = Object.keys(data).sort();
  if (!jours.length) return console.log("Fichier vide.");

  const tot = {};
  for (const d of jours) {
    const j = { kcal: 0, p: 0, g: 0, l: 0 };
    for (const repas of Object.keys(data[d])) {
      for (const [cle, q] of data[d][repas]) {
        const x = ligne(cle, q);
        j.kcal += x.kcal; j.p += x.p; j.g += x.g; j.l += x.l;
      }
    }
    tot[d] = j;
  }

  const cible = REF.cible;
  const pMin = cible.poids_actuel * cible.proteines_g_par_kg[0];
  const pMax = cible.poids_actuel * cible.proteines_g_par_kg[1];

  console.log(`APPORTS — ${jours.length} jour(s) du ${jours[0]} au ${jours.at(-1)}\n`);
  console.log("jour            kcal   prot   gluc   lip");
  for (const d of jours) {
    const j = tot[d];
    const alerte = j.p < pMin ? "  ← protéines courtes" : "";
    console.log(`${fmtD(d).padEnd(14)} ${String(n0(j.kcal)).padStart(5)}  ${String(n0(j.p)).padStart(5)}  ${String(n0(j.g)).padStart(5)}  ${String(n0(j.l)).padStart(4)}${alerte}`);
  }

  const moy = { kcal: 0, p: 0, g: 0, l: 0 };
  for (const d of jours) for (const k of Object.keys(moy)) moy[k] += tot[d][k] / jours.length;
  console.log(`\nMOYENNE         ${String(n0(moy.kcal)).padStart(5)}  ${String(n0(moy.p)).padStart(5)}  ${String(n0(moy.g)).padStart(5)}  ${String(n0(moy.l)).padStart(4)}`);
  console.log(`Cible protéines : ${n0(pMin)} à ${n0(pMax)} g  →  ${moy.p >= pMin ? "atteinte" : "MANQUE " + n0(pMin - moy.p) + " g/jour"}`);
  console.log(`Protéines par kg : ${n1(moy.p / cible.poids_actuel)} g/kg`);

  // ── Entretien mesuré : le seul chiffre qui ne se devine pas ───────────────
  let poids = [];
  try {
    poids = await rest(`checkin?weight=not.is.null&select=day,weight&order=day.asc`);
  } catch { /* hors ligne : on saute cette partie */ }
  const dans = poids.filter((c) => c.day >= jours[0] && c.day <= addJours(jours.at(-1), 7));
  if (dans.length < 2) {
    console.log(`\nENTRETIEN : pas encore mesurable (il faut au moins 2 pesées du lundi sur la période).`);
    console.log(`Dès que c'est le cas : entretien = apport moyen − (variation de poids × ${cible.kcal_par_kg_pris} / nb de jours).`);
    return;
  }
  const dKg = Number(dans.at(-1).weight) - Number(dans[0].weight);
  const dJours = Math.max(1, Math.round((Date.parse(dans.at(-1).day) - Date.parse(dans[0].day)) / 864e5));
  const parSem = (dKg / dJours) * 7;
  const entretien = moy.kcal - (dKg * cible.kcal_par_kg_pris) / dJours;
  const cibleKcal = entretien + (cible.prise_kg_par_semaine_cible * cible.kcal_par_kg_pris) / 7;
  const ajust = cibleKcal - moy.kcal;

  console.log(`\nENTRETIEN ET AJUSTEMENT`);
  console.log(`- Poids : ${n1(dans[0].weight)} → ${n1(dans.at(-1).weight)} kg sur ${dJours} jours, soit ${signe(parSem)}${n2(parSem)} kg/semaine`);
  console.log(`- Cible : +${n2(cible.prise_kg_par_semaine_cible)} kg/semaine (fourchette ${cible.prise_kg_par_semaine.map(n2).join(" à ")})`);
  console.log(`- Entretien estimé : ${n0(entretien)} kcal/jour`);
  console.log(`- Apport à viser : ${n0(cibleKcal)} kcal/jour`);
  console.log(`- AJUSTEMENT : ${ajust >= 0 ? "+" : ""}${n0(ajust)} kcal/jour par rapport à ce qu'il mange aujourd'hui`);
  if (moy.p < pMin) console.log(`- Et ${n0(pMin - moy.p)} g de protéines de plus par jour, en priorité sur les ${n0(ajust)} kcal.`);
}

function addJours(d, n) {
  const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
}

function table(filtre) {
  const ks = Object.keys(REF.aliments).filter((k) => !filtre || k.includes(filtre) || REF.aliments[k].famille === filtre);
  if (!ks.length) return console.log("Rien ne correspond.");
  console.log("clé                      aliment                              kcal  prot  unité");
  for (const k of ks) {
    const a = REF.aliments[k];
    console.log(`${k.padEnd(24)} ${a.nom.padEnd(36)} ${String(a.kcal).padStart(4)}  ${String(a.p).padStart(4)}  ${a.par === "piece" ? "pièce" : "100 g"}`);
  }
}

const [cmd, a] = process.argv.slice(2);
try {
  if (cmd === "liste") await liste(a ? Number(a) : 7);
  else if (cmd === "calc" && a) await calc(a);
  else if (cmd === "table") table(a);
  else console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(0, 14).join("\n").replace(/^\/\/ ?/gm, ""));
} catch (e) {
  console.error("Erreur :", e.message);
  process.exit(1);
}
