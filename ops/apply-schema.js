// Applique supabase/schema.sql sur la base Supabase. Le fichier est idempotent,
// donc relancer ce script ne casse rien.
//   node ops/apply-schema.js
const fs = require("fs"), path = require("path");
const { Client } = require("C:/Boulot/Lupio/Lupio Claude/lupio/node_modules/pg");
const ROOT = path.resolve(__dirname, "..");

const env = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2];
}
if (!env.DB_PASSWORD) { console.error("DB_PASSWORD manquant dans .env.local"); process.exit(1); }
const ref = new URL(env.SUPABASE_URL).hostname.split(".")[0];

// Le host direct (db.<ref>.supabase.co) n'est qu'en IPv6 : on passe par le pooler.
const client = new Client({
  host: env.DB_HOST || "aws-1-eu-west-3.pooler.supabase.com",
  port: 5432,                      // session mode : necessaire pour du DDL
  user: "postgres." + ref,
  password: env.DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await client.connect();
  await client.query(fs.readFileSync(path.join(ROOT, "supabase", "schema.sql"), "utf8"));
  const t = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name");
  console.log("Schéma appliqué. Tables :", t.rows.map(r => r.table_name).join(", "));
  const c = await client.query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'checkin' order by ordinal_position");
  console.log("checkin :", c.rows.map(r => r.column_name).join(", "));
  await client.end();
})().catch(async e => {
  console.error("Échec :", e.message);
  try { await client.end(); } catch {}
  process.exit(1);
});
