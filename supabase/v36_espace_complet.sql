-- Guichet fiscal : mise à jour 36 (espace des fonctionnaires complété)
--
-- 1. Signature du contrat de travail par l'agent lui-même, depuis son espace.
-- 2. Demandes des agents (congé, horaires, document, autre), avec réponse de l'encadrement.
-- 3. Entretiens et objectifs : l'agent les lit et indique qu'il en a pris connaissance.
-- 4. Mon espace : demandes, entretiens partagés et annuaire de l'équipe en plus.
-- 5-6. Droits : les RH lisent et écrivent demandes et entretiens ; l'Inspection répond aux demandes.
--
-- À exécuter après supabase/v35_rappels_agenda.sql. Il peut être exécuté plusieurs fois.

begin;

-- 1. Signature du contrat par l'agent ------------------------------------------------------------
-- L'agent signe son propre contrat « à signer » : date du jour (heure de Paris), « Lu et approuvé »
-- et son nom tel qu'il l'a tapé. Le contrat est alors figé, comme quand les RH enregistrent la signature.
create or replace function public.signer_contrat(p_id text, p_nom text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_fid text := public.mon_fonctionnaire();
  v_data jsonb;
begin
  if v_fid is null then
    raise exception 'Votre compte Discord n''est relié à aucune fiche de fonctionnaire.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_nom, ''))) < 2 then raise exception 'Tapez votre nom pour signer.' using errcode = 'P0001'; end if;
  select data into v_data from public.registre
    where collection = 'contratsTravail' and id = p_id and data->>'fid' = v_fid for update;
  if v_data is null then raise exception 'Ce contrat n''est pas le vôtre ou n''existe plus.' using errcode = 'P0001'; end if;
  if coalesce(v_data->>'statut', 'a_signer') = 'signe' then raise exception 'Ce contrat est déjà signé.' using errcode = 'P0001'; end if;
  v_data := v_data || jsonb_build_object(
    'statut', 'signe',
    'salarieSigneLe', to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD'),
    'signeEnregistrePar', 'l’agent, depuis son espace',
    'signeParAgent', true,
    'signatureNom', left(btrim(p_nom), 80),
    'signeA', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'modifieLe', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  update public.registre set data = v_data where collection = 'contratsTravail' and id = p_id;
  return v_data || jsonb_build_object('id', p_id);
end;
$$;
revoke all on function public.signer_contrat(text, text) from public, anon;
grant execute on function public.signer_contrat(text, text) to authenticated;

-- 2. Demandes des agents à l'encadrement ---------------------------------------------------------
-- Congé, changement d'horaires, document ou autre : l'agent l'envoie et peut l'annuler tant qu'elle
-- attend ; l'encadrement (Direction, Inspection, RH) l'accepte ou la refuse avec une réponse.
create or replace function public.faire_demande(p_type text, p_objet text, p_motif text, p_du date, p_au date)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_fid text := public.mon_fonctionnaire();
  v_nom text;
  v_id text;
  v_n int;
  v_data jsonb;
begin
  if v_fid is null then
    raise exception 'Votre compte Discord n''est relié à aucune fiche de fonctionnaire.' using errcode = '42501';
  end if;
  if p_type is null or p_type not in ('conge', 'horaires', 'document', 'autre') then
    raise exception 'Type de demande inconnu.' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_objet, ''))) < 3 then raise exception 'Donnez un objet à votre demande.' using errcode = 'P0001'; end if;
  if p_type = 'conge' and (p_du is null or p_au is null or p_au < p_du) then
    raise exception 'Indiquez les dates du congé (le dernier jour après le premier).' using errcode = 'P0001';
  end if;
  select count(*) into v_n from public.registre
    where collection = 'demandesAgents' and data->>'fid' = v_fid and data->>'statut' = 'envoyee';
  if v_n >= 10 then raise exception 'Vous avez déjà 10 demandes en attente de réponse.' using errcode = 'P0001'; end if;
  select f.data->>'nom' into v_nom from public.registre f where f.collection = 'fonctionnaires' and f.id = v_fid;
  v_id := 'da' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSMS') || substr(md5(random()::text || v_fid), 1, 6);
  v_data := jsonb_build_object(
    'fid', v_fid, 'nom', coalesce(v_nom, ''), 'type', p_type,
    'objet', left(btrim(p_objet), 120), 'motif', left(btrim(coalesce(p_motif, '')), 1500),
    'du', case when p_du is null then null else to_char(p_du, 'YYYY-MM-DD') end,
    'au', case when p_au is null then null else to_char(p_au, 'YYYY-MM-DD') end,
    'statut', 'envoyee', 'at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  insert into public.registre (collection, id, data) values ('demandesAgents', v_id, v_data);
  return v_data || jsonb_build_object('id', v_id);
end;
$$;
revoke all on function public.faire_demande(text, text, text, date, date) from public, anon;
grant execute on function public.faire_demande(text, text, text, date, date) to authenticated;

create or replace function public.annuler_demande(p_id text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_fid text := public.mon_fonctionnaire();
  v_data jsonb;
begin
  if v_fid is null then
    raise exception 'Votre compte Discord n''est relié à aucune fiche de fonctionnaire.' using errcode = '42501';
  end if;
  update public.registre r
     set data = r.data || jsonb_build_object('statut', 'annulee', 'annuleePar', 'agent',
                                             'annuleeLe', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
   where r.collection = 'demandesAgents' and r.id = p_id and r.data->>'fid' = v_fid and r.data->>'statut' = 'envoyee'
  returning r.data into v_data;
  if v_data is null then raise exception 'Cette demande n''attend plus de réponse.' using errcode = 'P0001'; end if;
  return v_data || jsonb_build_object('id', p_id);
end;
$$;
revoke all on function public.annuler_demande(text) from public, anon;
grant execute on function public.annuler_demande(text) to authenticated;

-- 3. Entretiens : l'agent indique qu'il en a pris connaissance, avec un commentaire s'il veut ------
create or replace function public.voir_entretien(p_id text, p_commentaire text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_fid text := public.mon_fonctionnaire();
  v_data jsonb;
begin
  if v_fid is null then
    raise exception 'Votre compte Discord n''est relié à aucune fiche de fonctionnaire.' using errcode = '42501';
  end if;
  update public.registre r
     set data = r.data || jsonb_build_object(
           'vuParAgentLe', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'commentaireAgent', left(btrim(coalesce(p_commentaire, '')), 1500))
   where r.collection = 'entretiens' and r.id = p_id and r.data->>'fid' = v_fid and r.data->>'statut' = 'partage'
  returning r.data into v_data;
  if v_data is null then raise exception 'Cet entretien n''existe plus ou ne vous concerne pas.' using errcode = 'P0001'; end if;
  return v_data || jsonb_build_object('id', p_id);
end;
$$;
revoke all on function public.voir_entretien(text, text) from public, anon;
grant execute on function public.voir_entretien(text, text) to authenticated;

-- 4. Mon espace : celle de la mise à jour 31, avec les demandes, les entretiens et l'annuaire ------
create or replace function public.mon_espace()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_fid   text := public.mon_fonctionnaire();
  v_staff boolean := coalesce(public.mon_role() in ('direction', 'inspecteur', 'rh', 'lecture'), false);
  v_depuis text := to_char((now() - interval '60 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS');
  v_jour  text := to_char((now() - interval '60 days') at time zone 'Europe/Paris', 'YYYY-MM-DD');
begin
  if v_fid is null then
    return null;
  end if;
  return jsonb_build_object(
    'fid', v_fid,
    'fonctionnaire', (select f.data || jsonb_build_object('id', f.id) from public.registre f
                      where f.collection = 'fonctionnaires' and f.id = v_fid),
    -- Le barème des payes, sans le budget.
    'bareme', (select jsonb_strip_nulls(jsonb_build_object(
                 'grades', c.data->'payes'->'grades', 'plafondHeures', c.data->'payes'->'plafondHeures',
                 'payeMax', c.data->'payes'->'payeMax', 'primes', c.data->'payes'->'primes',
                 'primesDepuis', c.data->'payes'->'primesDepuis', 'service', c.data->'payes'->'service'))
               from public.registre c where c.collection = 'config' and c.id = 'main'),
    'contrats', coalesce((select jsonb_agg(r.data || jsonb_build_object('id', r.id) order by r.data->>'at' desc)
                          from public.registre r where r.collection = 'contratsTravail' and r.data->>'fid' = v_fid), '[]'::jsonb),
    -- Les 26 dernières semaines de paye, réduites à sa ligne, ses rappels, ses retenues et ses heures saisies.
    'payes', coalesce((select jsonb_agg(x.j order by x.id desc) from (
        select p.id, jsonb_build_object(
          'id', p.id, 'semaine', p.id, 'statut', p.data->'statut', 'verseeLe', p.data->'verseeLe',
          'coef', p.data->'coef', 'coefRappels', p.data->'coefRappels',
          'lignes', coalesce((select jsonb_agg(l) from jsonb_array_elements(
                      case when jsonb_typeof(p.data->'lignes') = 'array' then p.data->'lignes' else '[]'::jsonb end) l
                    where l->>'fid' = v_fid), '[]'::jsonb),
          'rappels', coalesce((select jsonb_agg(l) from jsonb_array_elements(
                      case when jsonb_typeof(p.data->'rappels') = 'array' then p.data->'rappels' else '[]'::jsonb end) l
                    where l->>'fid' = v_fid), '[]'::jsonb),
          'retenues', coalesce((select jsonb_agg(l) from jsonb_array_elements(
                      case when jsonb_typeof(p.data->'retenues') = 'array' then p.data->'retenues' else '[]'::jsonb end) l
                    where l->>'fid' = v_fid), '[]'::jsonb),
          'saisie', case when jsonb_typeof(p.data->'saisie') = 'object' and p.data->'saisie' ? v_fid
                         then jsonb_build_object(v_fid, p.data->'saisie'->v_fid) else '{}'::jsonb end) as j
        from public.registre p
        where p.collection = 'payes' and p.id ~ '^\d{4}-S\d{2}$'
        order by p.id desc
        limit 26) x), '[]'::jsonb),
    'rappels', coalesce((select jsonb_agg(r.data || jsonb_build_object('id', r.id))
                         from public.registre r where r.collection = 'rappels' and r.data->>'fid' = v_fid), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(x.j order by x.at) from (
        select r.data->>'at' as at, r.data || jsonb_build_object('id', r.id) as j
        from public.registre r where r.collection = 'messagesAgents' and r.data->>'fid' = v_fid
        order by r.data->>'at' desc limit 300) x), '[]'::jsonb),
    -- L'agenda qui le concerne : pour tous, ou pour lui ; l'encadrement voit aussi ses propres réunions.
    'agenda', coalesce((select jsonb_agg(r.data || jsonb_build_object('id', r.id) order by r.data->>'debut')
        from public.registre r
        where r.collection = 'agenda'
          and coalesce(r.data->>'fin', r.data->>'debut', '') >= v_depuis
          and (coalesce(r.data->>'audience', 'tous') = 'tous'
               or (r.data->>'audience' = 'agents' and jsonb_typeof(r.data->'participants') = 'array' and r.data->'participants' ? v_fid)
               or (v_staff and r.data->>'audience' = 'encadrement'))), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(x.j order by x.at desc) from (
        select r.data->>'at' as at, r.data || jsonb_build_object('id', r.id) as j
        from public.registre r where r.collection = 'notesService' and coalesce(r.data->>'retiree', 'false') <> 'true'
        order by r.data->>'at' desc limit 40) x), '[]'::jsonb),
    'absences', coalesce((select jsonb_agg(r.data || jsonb_build_object('id', r.id) order by r.data->>'du' desc)
        from public.registre r where r.collection = 'absences' and r.data->>'fid' = v_fid
          and coalesce(r.data->>'au', '') >= v_jour), '[]'::jsonb),
    -- Ses sanctions disciplinaires (sauf celles annulées).
    'sanctions', coalesce((select jsonb_agg(r.data || jsonb_build_object('id', r.id) order by r.data->>'at' desc)
        from public.registre r where r.collection = 'sanctions' and r.data->>'fid' = v_fid
          and coalesce(r.data->>'statut', '') <> 'annulee'), '[]'::jsonb),
    -- Ses demandes (les 60 dernières).
    'demandes', coalesce((select jsonb_agg(x.j order by x.at desc) from (
        select r.data->>'at' as at, r.data || jsonb_build_object('id', r.id) as j
        from public.registre r where r.collection = 'demandesAgents' and r.data->>'fid' = v_fid
        order by r.data->>'at' desc limit 60) x), '[]'::jsonb),
    -- Ses entretiens et objectifs, une fois partagés par l'encadrement.
    'entretiens', coalesce((select jsonb_agg(r.data || jsonb_build_object('id', r.id) order by r.data->>'date' desc, r.data->>'at' desc)
        from public.registre r where r.collection = 'entretiens' and r.data->>'fid' = v_fid
          and r.data->>'statut' = 'partage'), '[]'::jsonb),
    -- L'annuaire : les fonctionnaires en service, leur grade, leur poste et leur rôle au guichet.
    'annuaire', coalesce((select jsonb_agg(jsonb_build_object(
          'id', f.id, 'nom', f.data->>'nom', 'grade', f.data->>'grade', 'discordId', f.data->>'discordId',
          'role', (select a.role from public.agents a where a.discord_id = f.data->>'discordId'),
          'poste', (select c.data->>'poste' from public.registre c
                     where c.collection = 'contratsTravail' and c.data->>'fid' = f.id
                     order by c.data->>'at' desc limit 1)) order by f.data->>'nom')
        from public.registre f where f.collection = 'fonctionnaires' and coalesce(f.data->>'actif', 'true') <> 'false'), '[]'::jsonb)
  );
end
$$;
revoke all on function public.mon_espace() from public, anon;
grant execute on function public.mon_espace() to authenticated;

-- 5. Lecture : les ressources humaines lisent aussi les demandes et les entretiens ---------------
drop policy if exists "registre lecture" on public.registre;
create policy "registre lecture" on public.registre for select to authenticated using (
  (select public.mon_role()) in ('direction', 'inspecteur', 'lecture')
  or ((select public.mon_role()) = 'rh'
      and (collection in ('config', 'fonctionnaires', 'contratsTravail', 'rh', 'messagesAgents', 'agenda', 'absences', 'notesService', 'sanctions', 'demandesAgents', 'entretiens')
           or (collection = 'rappels' and data->>'origine' = 'retenue' and coalesce(data->>'sanction', '') <> '')))
  or ((select public.mon_role()) = 'pointeuse' and collection = 'pointages'
      and data->>'discordId' = (select public.mon_discord())
      and now() < timestamptz '2026-11-09 00:00:00 Europe/Paris'));

-- 6. Écriture : l'encadrement répond aux demandes ; Direction et RH écrivent les entretiens --------
create or replace function public.ecriture_permise(p_collection text, p_id text, p_data jsonb)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case public.mon_role()
    when 'direction' then true
    when 'inspecteur' then
      p_collection in ('demandes', 'relances', 'releves', 'depots', 'signalements')
      or (p_collection = 'prets' and p_data->>'statut' in ('demande', 'annule'))
      or (p_collection = 'vehicules' and public.vehicule_inspection_ok(p_id, p_data))
      or (p_collection = 'convocations' and public.convocation_inspection_ok(p_id, p_data))
      or (p_collection = 'contrats' and coalesce(p_data->>'statut', 'projet') in ('projet', 'annule')
          and nullif(p_data->'signeLe', 'null'::jsonb) is null
          and jsonb_array_length(coalesce(nullif(p_data->'paiements', 'null'::jsonb), '[]'::jsonb)) = 0
          and not exists (select 1 from public.registre r
                          where r.collection = 'contrats' and r.id = p_id and coalesce(r.data->>'statut', 'projet') <> 'projet'))
      or (p_collection = 'conventions' and coalesce(p_data->>'statut', 'projet') in ('projet', 'annulee')
          and nullif(p_data->'signeLe', 'null'::jsonb) is null
          and not exists (select 1 from public.registre r
                          where r.collection = 'conventions' and r.id = p_id and coalesce(r.data->>'statut', 'projet') <> 'projet'))
      or (p_collection = 'prestations' and public.prestation_inspection_ok(p_id, p_data))
      or (p_collection = 'versements' and public.versement_inspection_ok(p_id, p_data))
      or (p_collection = 'attestations' and p_data->>'revoqueeLe' is null)
      or (p_collection = 'controles' and coalesce(p_data->>'statut', '') in ('ouvert', 'propose', 'sans_suite'))
      or (p_collection = 'decisions' and coalesce(p_data->>'statut', '') in ('validee', 'controle'))
      or (p_collection = 'decisions' and p_data->>'statut' = 'rejetee' and coalesce(p_data->>'remplaceePar', '') <> ''
          and not exists (select 1 from public.registre r
                          where r.collection = 'decisions' and r.id = p_id and r.data->>'statut' = 'payee'))
      -- Encadrement des fonctionnaires : messages, agenda, absences et réponses aux demandes.
      or p_collection in ('messagesAgents', 'agenda', 'absences', 'demandesAgents')
      or (p_collection = 'declarations' and not exists (
            select 1 from public.registre r
            where r.collection = 'decisions' and r.id = p_id and r.data->>'statut' = 'payee'))
    -- Ressources humaines : les fiches des fonctionnaires, leurs contrats de travail et le modèle de contrat.
    when 'rh' then p_collection in ('fonctionnaires', 'contratsTravail', 'rh', 'messagesAgents', 'agenda', 'absences', 'notesService', 'sanctions', 'demandesAgents', 'entretiens')
      -- La retenue sur salaire d'une sanction (et rien d'autre de la paye).
      or (p_collection = 'rappels' and p_data->>'origine' = 'retenue' and coalesce(p_data->>'sanction', '') <> '')
    else false
  end
$$;
revoke all on function public.ecriture_permise(text, text, jsonb) from public, anon;
grant execute on function public.ecriture_permise(text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- 7. Le lundi soir (20 h l'hiver, 21 h l'été) : la fonction notifier signale à la Direction les heures
--    de la semaine passée pas encore saisies dans la paye (notification « Délais » et salon Direction).
create or replace function public.notif_lundi()
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
    body := jsonb_build_object('type', 'lundi'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-guichet-cle', c.secret),
    timeout_milliseconds := 10000);
end
$$;
revoke all on function public.notif_lundi() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'guichet-notif-lundi';
select cron.schedule('guichet-notif-lundi', '0 19 * * 1', 'select public.notif_lundi()');

commit;
