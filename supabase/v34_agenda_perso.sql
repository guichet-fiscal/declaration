-- Guichet fiscal : mise à jour 34 (agenda personnel des fonctionnaires)
--
-- Chaque fonctionnaire ajoute ses propres événements dans l'agenda de son espace (rendez-vous,
-- rappel, formation à préparer…). Ils ne sont visibles que par lui : ni la Direction, ni
-- l'Inspection, ni les ressources humaines ne les lisent. Ils ne passent pas par le registre (pas de
-- journal, pas de sauvegarde, pas d'export Google Sheets).
--
-- Le service « notifier » (passage horaire) envoie un rappel une heure avant, sur les appareils du
-- fonctionnaire, quand il l'a demandé pour l'événement.
--
-- À exécuter après supabase/v30_espace_agents.sql (fonction mon_fonctionnaire). Il peut être
-- exécuté plusieurs fois.

begin;

create table if not exists public.agenda_perso (
  id uuid primary key default gen_random_uuid(),
  fid text not null,
  titre text not null check (length(btrim(titre)) between 1 and 120),
  debut timestamptz not null,
  fin timestamptz,
  journee boolean not null default false,
  lieu text not null default '' check (length(lieu) <= 120),
  note text not null default '' check (length(note) <= 1000),
  rappel boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz,
  check (fin is null or fin >= debut)
);
create index if not exists agenda_perso_fid_debut on public.agenda_perso (fid, debut);
create index if not exists agenda_perso_debut on public.agenda_perso (debut) where rappel and not journee;

alter table public.agenda_perso enable row level security;

-- Chacun ne voit, n'ajoute, ne modifie et ne supprime que ses propres événements.
drop policy if exists "agenda perso lecture" on public.agenda_perso;
create policy "agenda perso lecture" on public.agenda_perso for select to authenticated
  using (fid = (select public.mon_fonctionnaire()));
drop policy if exists "agenda perso ajout" on public.agenda_perso;
create policy "agenda perso ajout" on public.agenda_perso for insert to authenticated
  with check (fid = (select public.mon_fonctionnaire()));
drop policy if exists "agenda perso modification" on public.agenda_perso;
create policy "agenda perso modification" on public.agenda_perso for update to authenticated
  using (fid = (select public.mon_fonctionnaire()))
  with check (fid = (select public.mon_fonctionnaire()));
drop policy if exists "agenda perso suppression" on public.agenda_perso;
create policy "agenda perso suppression" on public.agenda_perso for delete to authenticated
  using (fid = (select public.mon_fonctionnaire()));

revoke all on public.agenda_perso from anon;
grant select, insert, update, delete on public.agenda_perso to authenticated;

-- 300 événements au plus par fonctionnaire (les plus anciens peuvent être supprimés).
create or replace function public.agenda_perso_limite()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.agenda_perso where fid = new.fid) >= 300 then
    raise exception 'Agenda personnel plein : 300 événements au plus. Supprimez-en d''anciens.';
  end if;
  return new;
end;
$$;
revoke all on function public.agenda_perso_limite() from public, anon, authenticated;
drop trigger if exists agenda_perso_limite on public.agenda_perso;
create trigger agenda_perso_limite before insert on public.agenda_perso
  for each row execute function public.agenda_perso_limite();

commit;
