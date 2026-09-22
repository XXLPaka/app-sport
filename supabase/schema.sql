-- App sport (Bloc 2) — schéma de synchro.
-- Idempotent : peut être relancé sans risque.
-- Règle de sécurité : chaque ligne appartient à un compte, et un compte ne voit que ses lignes.

-- Horodatage serveur : c'est lui qui arbitre entre téléphone et base.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── Séances : une ligne par exercice et par jour ────────────────────────────
create table if not exists public.workout_entry (
  user_id    uuid not null references auth.users(id) on delete cascade,
  exo        text not null,
  day        date not null,
  weight     numeric,          -- charge du jour
  reps       smallint[],       -- reps par série : {8,8,7,6}
  pain       smallint,         -- douleur /10
  comment    text,
  client_at  timestamptz,      -- heure de saisie sur le téléphone
  updated_at timestamptz not null default now(),
  primary key (user_id, exo, day)
);
create index if not exists workout_entry_sync_idx on public.workout_entry (user_id, updated_at);
drop trigger if exists workout_entry_touch on public.workout_entry;
create trigger workout_entry_touch before insert or update on public.workout_entry
  for each row execute function public.touch_updated_at();

-- ── Bilans de fin de séance ─────────────────────────────────────────────────
create table if not exists public.session_note (
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        date not null,
  session    text not null,
  note       text not null default '',
  client_at  timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, day, session)
);
create index if not exists session_note_sync_idx on public.session_note (user_id, updated_at);
drop trigger if exists session_note_touch on public.session_note;
create trigger session_note_touch before insert or update on public.session_note
  for each row execute function public.touch_updated_at();

-- ── Consignes du coach : écrites côté coach, lues par l'app ─────────────────
create table if not exists public.coach_note (
  user_id    uuid not null references auth.users(id) on delete cascade,
  exo        text not null,
  note       text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, exo)
);
drop trigger if exists coach_note_touch on public.coach_note;
create trigger coach_note_touch before insert or update on public.coach_note
  for each row execute function public.touch_updated_at();

-- ── Sécurité ────────────────────────────────────────────────────────────────
-- RLS seule ne suffit pas sur Supabase récent : il faut aussi les GRANT.
alter table public.workout_entry enable row level security;
alter table public.session_note  enable row level security;
alter table public.coach_note    enable row level security;

drop policy if exists workout_entry_own on public.workout_entry;
create policy workout_entry_own on public.workout_entry for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists session_note_own on public.session_note;
create policy session_note_own on public.session_note for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- L'app lit les consignes mais ne les écrit pas (écriture réservée à la clé secrète du coach).
drop policy if exists coach_note_read on public.coach_note;
create policy coach_note_read on public.coach_note for select to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.workout_entry to authenticated;
grant select, insert, update, delete on public.session_note  to authenticated;
grant select                          on public.coach_note    to authenticated;
