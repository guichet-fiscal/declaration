-- Guichet fiscal : mise à jour 35 (rappels de l'agenda au choix de chacun)
--
-- Chaque fonctionnaire choisit quand il est prévenu sur ses appareils :
--  1. pour ses événements personnels (mise à jour 34) : aucun rappel, 10 min, 30 min, 1 h, 2 h avant
--     ou la veille à la même heure (colonne rappel_min) ;
--  2. pour les rendez-vous de l'encadrement : un rappel habituel, et au besoin un autre pour un
--     rendez-vous donné (table rappels_agents, visible de lui seul) ;
--  3. le service « notifier » passe toutes les 5 minutes pour envoyer ces rappels à l'heure choisie
--     (avant, il ne passait qu'une fois par heure, avec un rappel fixe d'une heure).
--
-- À exécuter après supabase/v34_agenda_perso.sql. Il peut être exécuté plusieurs fois.

begin;

-- 1. Agenda personnel : délai du rappel en minutes (vide = pas de rappel) ---------------------------
alter table public.agenda_perso add column if not exists rappel_min integer;
alter table public.agenda_perso drop constraint if exists agenda_perso_rappel_min_check;
alter table public.agenda_perso add constraint agenda_perso_rappel_min_check
  check (rappel_min is null or rappel_min in (10, 30, 60, 120, 1440));
-- Les événements déjà notés avec « me prévenir une heure avant » gardent ce rappel.
update public.agenda_perso set rappel_min = 60 where rappel and rappel_min is null and not journee;
create index if not exists agenda_perso_rappel on public.agenda_perso (debut) where rappel_min is not null and not journee;

-- 2. Rappels choisis pour les rendez-vous de l'encadrement ------------------------------------------
-- defaut_min : rappel habituel (vide = aucun) ; evenements : { id du rendez-vous : minutes ou null }
-- pour un rendez-vous réglé autrement.
create table if not exists public.rappels_agents (
  fid text primary key,
  defaut_min integer default 60 check (defaut_min is null or defaut_min in (10, 30, 60, 120, 1440)),
  evenements jsonb not null default '{}'::jsonb check (jsonb_typeof(evenements) = 'object' and pg_column_size(evenements) < 20000),
  modifie_le timestamptz not null default now()
);
alter table public.rappels_agents enable row level security;

drop policy if exists "rappels lecture" on public.rappels_agents;
create policy "rappels lecture" on public.rappels_agents for select to authenticated
  using (fid = (select public.mon_fonctionnaire()));
drop policy if exists "rappels ajout" on public.rappels_agents;
create policy "rappels ajout" on public.rappels_agents for insert to authenticated
  with check (fid = (select public.mon_fonctionnaire()));
drop policy if exists "rappels modification" on public.rappels_agents;
create policy "rappels modification" on public.rappels_agents for update to authenticated
  using (fid = (select public.mon_fonctionnaire()))
  with check (fid = (select public.mon_fonctionnaire()));
drop policy if exists "rappels suppression" on public.rappels_agents;
create policy "rappels suppression" on public.rappels_agents for delete to authenticated
  using (fid = (select public.mon_fonctionnaire()));

revoke all on public.rappels_agents from anon;
grant select, insert, update, delete on public.rappels_agents to authenticated;

-- 3. Passage toutes les 5 minutes du service d'envoi ------------------------------------------------
create or replace function public.notif_rappels()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.notif_config;
begin
  select * into c from public.notif_config where id = 1;
  if c.url is null then return; end if;
  perform net.http_post(
    url := c.url,
    body := jsonb_build_object('type', 'rappels'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-guichet-cle', c.secret),
    timeout_milliseconds := 10000);
end
$$;
revoke all on function public.notif_rappels() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'guichet-notif-rappels';
select cron.schedule('guichet-notif-rappels', '*/5 * * * *', 'select public.notif_rappels()');

commit;
