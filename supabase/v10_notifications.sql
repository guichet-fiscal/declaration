-- Guichet fiscal : mise à jour 10 · Notifications sur téléphone et ordinateur
--
-- À exécuter une fois dans Supabase → SQL Editor, après la mise à jour 9.
-- Le script peut être relancé sans risque.
--
-- Chaque agent choisit dans le guichet (bouton cloche du bandeau) les notifications qu'il
-- reçoit sur chacun de ses appareils. Quand le registre change, la base prévient le service
-- d'envoi « notifier » (Supabase → Edge Functions), qui notifie les agents abonnés. Une fois
-- par heure, le service signale aussi les délais qui viennent d'expirer.
--
-- Rien à copier à la main : la clé qui protège le service et les clés d'envoi sont créées
-- toutes seules et restent dans une table que seuls la base et le service lisent.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- 1. Abonnements : un par appareil -----------------------------------------------
create table if not exists public.notif_abonnements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  prefs      jsonb not null default '[]'::jsonb,
  appareil   text not null default '',
  cree_le    timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
alter table public.notif_abonnements enable row level security;
revoke all on public.notif_abonnements from anon, authenticated;
grant select, insert, update, delete on public.notif_abonnements to authenticated;

-- Chacun ne voit et ne gère que ses propres appareils, s'il a un accès au guichet.
drop policy if exists "notif lecture"      on public.notif_abonnements;
drop policy if exists "notif ajout"        on public.notif_abonnements;
drop policy if exists "notif modification" on public.notif_abonnements;
drop policy if exists "notif suppression"  on public.notif_abonnements;
create policy "notif lecture" on public.notif_abonnements for select to authenticated
  using (user_id = auth.uid());
create policy "notif ajout" on public.notif_abonnements for insert to authenticated
  with check (user_id = auth.uid() and public.mon_role() is not null);
create policy "notif modification" on public.notif_abonnements for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.mon_role() is not null);
create policy "notif suppression" on public.notif_abonnements for delete to authenticated
  using (user_id = auth.uid());

-- 2. Réglages privés du service (clé partagée, clés d'envoi) ------------------------
create table if not exists public.notif_config (
  id            int primary key default 1 check (id = 1),
  secret        text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  url           text,
  vapid_public  text,
  vapid_private text
);
alter table public.notif_config enable row level security;
revoke all on public.notif_config from anon, authenticated;
-- Aucune règle d'accès : seuls la base (fonctions ci-dessous) et le service d'envoi la lisent.
insert into public.notif_config (id, url)
values (1, 'https://xdmhnymirvozmgddmgir.supabase.co/functions/v1/notifier')
on conflict (id) do nothing;

-- 3. Le registre change : le service est prévenu ---------------------------------------
create or replace function public.notif_registre()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.notif_config;
begin
  select * into c from public.notif_config where id = 1;
  if c.url is null then return null; end if;
  perform net.http_post(
    url := c.url,
    body := jsonb_build_object(
      'collection', new.collection, 'id', new.id, 'action', tg_op,
      'avant', case when tg_op = 'UPDATE' then old.data end, 'apres', new.data,
      'auteur', new.updated_by),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-guichet-cle', c.secret),
    timeout_milliseconds := 5000);
  return null;
exception when others then
  -- Une notification qui ne part pas ne doit jamais empêcher un enregistrement.
  return null;
end
$$;
revoke all on function public.notif_registre() from public, anon, authenticated;

drop trigger if exists notif_registre on public.registre;
create trigger notif_registre
  after insert or update on public.registre
  for each row
  when (new.collection in ('declarations', 'decisions', 'penalites', 'demandes', 'prets', 'controles', 'vehicules'))
  execute function public.notif_registre();

-- 4. Destinataires d'une notification (lu par le service d'envoi seulement) ------------
create or replace function public.notif_destinataires(p_type text, p_auteur uuid)
returns setof public.notif_abonnements
language sql stable security definer
set search_path = ''
as $$
  select s.*
  from public.notif_abonnements s
  where s.prefs ? p_type
    and (p_auteur is null or s.user_id <> p_auteur)
    and exists (
      select 1 from auth.identities i
      join public.agents a on i.provider = 'discord' and i.provider_id = a.discord_id
      where i.user_id = s.user_id)
$$;
revoke all on function public.notif_destinataires(text, uuid) from public, anon, authenticated;
grant execute on function public.notif_destinataires(text, uuid) to service_role;

-- 5. Une fois par heure : les délais qui viennent d'expirer -----------------------------
create or replace function public.notif_delais()
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
    body := jsonb_build_object('type', 'delais'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-guichet-cle', c.secret),
    timeout_milliseconds := 10000);
end
$$;
revoke all on function public.notif_delais() from public, anon, authenticated;

select cron.schedule('guichet-notif-delais', '2 * * * *', 'select public.notif_delais()');
