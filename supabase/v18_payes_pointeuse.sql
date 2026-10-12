-- Guichet fiscal : mise à jour 18 (payes de la Préfecture et pointeuse)
--
-- Les payes des fonctionnaires de la Préfecture se font sur le site (Services publics → Payes), à
-- l'heure de service. Les heures viennent de la pointeuse : chaque agent prend et finit son service
-- depuis le site. Ce script :
--  1. crée le rôle d'accès « pointeuse » : la personne ne voit que la pointeuse et ses propres
--     pointages, rien d'autre du registre (ni les dossiers, ni le journal, ni la liste des accès, ni
--     les pièces jointes, ni qui est connecté) ;
--  2. ouvre la pointeuse à tous les rôles (Direction, Inspection, Lecture seule, Pointeuse) par une
--     fonction « pointer » : l'heure de prise et de fin de service est celle du serveur, personne ne
--     peut la choisir ni pointer pour un autre. Seule la Direction corrige un pointage.
--
-- Rien d'autre ne change : la paye elle-même (fiches des fonctionnaires, payes versées, rappels) est
-- enregistrée par la Direction comme les autres dossiers. Le site fonctionne avant ce script ; seule
-- la pointeuse attend qu'il soit exécuté.
--
-- À exécuter après supabase/v17_budget_mensuel.sql. Il peut être exécuté plusieurs fois.

begin;

-- 1. Le rôle « pointeuse » ----------------------------------------------------------------------------
alter table public.agents drop constraint if exists agents_role_check;
alter table public.agents add constraint agents_role_check
  check (role in ('direction', 'inspecteur', 'lecture', 'pointeuse'));

-- Identifiant Discord de la personne connectée (lu dans son identité vérifiée).
create or replace function public.mon_discord()
returns text
language sql stable security definer
set search_path = ''
as $$
  select i.provider_id from auth.identities i
  where i.user_id = auth.uid() and i.provider = 'discord'
  limit 1
$$;
revoke all on function public.mon_discord() from public, anon;
grant execute on function public.mon_discord() to authenticated;

-- 2. Ce que lit chacun ---------------------------------------------------------------------------------
-- Direction, Inspection et Lecture seule lisent tout le registre, comme avant. La pointeuse ne lit que
-- ses propres pointages.
drop policy if exists "registre lecture" on public.registre;
create policy "registre lecture" on public.registre for select to authenticated using (
  (select public.mon_role()) in ('direction', 'inspecteur', 'lecture')
  or ((select public.mon_role()) = 'pointeuse' and collection = 'pointages'
      and data->>'discordId' = (select public.mon_discord())));

drop policy if exists "agents lecture" on public.agents;
create policy "agents lecture" on public.agents for select to authenticated using (
  (select public.mon_role()) in ('direction', 'inspecteur', 'lecture')
  or discord_id = (select public.mon_discord()));

drop policy if exists "journal lecture" on public.journal;
create policy "journal lecture" on public.journal for select to authenticated
  using ((select public.mon_role()) in ('direction', 'inspecteur', 'lecture'));

drop policy if exists "pieces lecture" on storage.objects;
create policy "pieces lecture" on storage.objects for select to authenticated
  using (bucket_id = 'pieces' and (select public.mon_role()) in ('direction', 'inspecteur', 'lecture'));

-- Présence en direct (qui est connecté, quel dossier il consulte) : pas pour la pointeuse.
drop policy if exists "guichet presence lecture" on realtime.messages;
create policy "guichet presence lecture" on realtime.messages
  for select to authenticated
  using (realtime.topic() = 'guichet:presence' and (select public.mon_role()) in ('direction', 'inspecteur', 'lecture'));
drop policy if exists "guichet presence envoi" on realtime.messages;
create policy "guichet presence envoi" on realtime.messages
  for insert to authenticated
  with check (realtime.topic() = 'guichet:presence' and (select public.mon_role()) in ('direction', 'inspecteur', 'lecture'));

-- Notifications (mise à jour 10) : la pointeuse ne s'y abonne pas et n'en reçoit pas.
do $do$
begin
  if to_regclass('public.notif_abonnements') is not null then
    execute 'drop policy if exists "notif ajout" on public.notif_abonnements';
    execute $p$create policy "notif ajout" on public.notif_abonnements for insert to authenticated
      with check (user_id = auth.uid() and (select public.mon_role()) in ('direction', 'inspecteur', 'lecture'))$p$;
    execute 'drop policy if exists "notif modification" on public.notif_abonnements';
    execute $p$create policy "notif modification" on public.notif_abonnements for update to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid() and (select public.mon_role()) in ('direction', 'inspecteur', 'lecture'))$p$;
    execute $f$
      create or replace function public.notif_destinataires(p_type text, p_auteur uuid)
      returns setof public.notif_abonnements
      language sql stable security definer
      set search_path = ''
      as $q$
        select s.*
        from public.notif_abonnements s
        where s.prefs ? p_type
          and (p_auteur is null or s.user_id <> p_auteur)
          and exists (
            select 1 from auth.identities i
            join public.agents a on i.provider = 'discord' and i.provider_id = a.discord_id
            where i.user_id = s.user_id and a.role in ('direction', 'inspecteur', 'lecture'))
      $q$
    $f$;
    execute 'revoke all on function public.notif_destinataires(text, uuid) from public, anon, authenticated';
    execute 'grant execute on function public.notif_destinataires(text, uuid) to service_role';
  end if;
end
$do$;

-- 3. La pointeuse ----------------------------------------------------------------------------------------
-- pointer('debut') ouvre un service à l'heure du serveur, pointer('fin') ferme le service en cours.
-- Chaque pointage est un dossier « pointages » : { discordId, nom, debut, fin, source }. Un service de
-- plus de 12 h est marqué « à vérifier » : la Direction contrôle ces heures avant la paye.
create or replace function public.pointer(p_action text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_role    text := public.mon_role();
  v_discord text := public.mon_discord();
  v_nom     text;
  v_now     timestamptz := now();
  v_iso     text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_id      text;
  v_data    jsonb;
  v_open    public.registre%rowtype;
begin
  if v_role is null or v_discord is null then
    raise exception 'Votre compte n''a pas accès au guichet.' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('debut', 'fin') then
    raise exception 'Action de pointeuse inconnue.' using errcode = 'P0001';
  end if;
  -- Une seule action à la fois pour une même personne (double clic, deux onglets).
  perform pg_advisory_xact_lock(hashtext('guichet-pointage:' || v_discord));
  select a.nom into v_nom from public.agents a where a.discord_id = v_discord;
  select r.* into v_open from public.registre r
   where r.collection = 'pointages' and r.data->>'discordId' = v_discord
     and coalesce(r.data->>'fin', '') = '' and coalesce((r.data->>'annule')::boolean, false) = false
   order by r.data->>'debut' desc
   limit 1;
  if p_action = 'debut' then
    if found then
      raise exception 'Vous êtes déjà en service depuis le %.',
        to_char((v_open.data->>'debut')::timestamptz at time zone 'Europe/Paris', 'DD/MM à HH24:MI') using errcode = 'P0001';
    end if;
    v_id := 'pt' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSMS') || substr(md5(random()::text || v_discord), 1, 6);
    v_data := jsonb_build_object('discordId', v_discord, 'nom', coalesce(v_nom, ''), 'debut', v_iso, 'fin', null,
                                 'source', 'pointeuse', 'at', v_iso);
    insert into public.registre (collection, id, data) values ('pointages', v_id, v_data);
  else
    if not found then
      raise exception 'Vous n''êtes pas en service.' using errcode = 'P0001';
    end if;
    v_id := v_open.id;
    v_data := v_open.data || jsonb_build_object('fin', v_iso, 'finSource', 'pointeuse');
    if v_now - (v_open.data->>'debut')::timestamptz > interval '12 hours' then
      v_data := v_data || jsonb_build_object('aVerifier', true);
    end if;
    update public.registre set data = v_data where collection = 'pointages' and id = v_id;
  end if;
  return jsonb_build_object('id', v_id, 'data', v_data);
end
$$;
revoke all on function public.pointer(text) from public, anon;
grant execute on function public.pointer(text) to authenticated;

commit;
