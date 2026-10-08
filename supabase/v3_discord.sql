-- =====================================================================
-- Guichet fiscal : mise à jour 3 · Publication sur Discord
-- Une table privée garde les adresses des salons Discord (webhooks).
-- À exécuter une fois après schema.sql et v2_journal_export.sql :
-- SQL Editor → New query → coller → Run. Le script peut être relancé.
-- =====================================================================

-- Une adresse de webhook suffit pour poster dans un salon : elle n'est
-- lisible que par la Direction, jamais par la lecture seule. Elle
-- n'apparaît ni dans le journal, ni dans les sauvegardes, ni dans
-- l'export Google Sheets.
create table if not exists public.parametres_prives (
  cle        text primary key,
  valeur     jsonb not null default '{}'::jsonb,
  modifie_le timestamptz not null default now()
);
alter table public.parametres_prives enable row level security;
revoke all on public.parametres_prives from anon, authenticated;
grant select, insert, update, delete on public.parametres_prives to authenticated;

drop policy if exists "prives lecture"      on public.parametres_prives;
drop policy if exists "prives ajout"        on public.parametres_prives;
drop policy if exists "prives modification" on public.parametres_prives;
drop policy if exists "prives suppression"  on public.parametres_prives;
create policy "prives lecture"      on public.parametres_prives for select to authenticated using (public.mon_role() = 'direction');
create policy "prives ajout"        on public.parametres_prives for insert to authenticated with check (public.mon_role() = 'direction');
create policy "prives modification" on public.parametres_prives for update to authenticated using (public.mon_role() = 'direction') with check (public.mon_role() = 'direction');
create policy "prives suppression"  on public.parametres_prives for delete to authenticated using (public.mon_role() = 'direction');
