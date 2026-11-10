-- Guichet fiscal : mise à jour 30 (espace des fonctionnaires, messagerie, agenda)
--
-- Chaque fonctionnaire de la Préfecture dont la fiche porte son compte Discord a désormais son espace
-- au guichet, sans accès à donner : il se connecte avec Discord et ne voit que ce qui le concerne
-- (sa fiche, son contrat de travail, ses payes et ses heures des semaines passées, ses rappels, sa
-- conversation avec l'encadrement, l'agenda qui le concerne, les notes de service, ses absences).
-- Il ne lit jamais le registre : la fonction « mon_espace » lui renvoie ses seules données, et quatre
-- fonctions font ses seuls gestes (écrire à l'encadrement, marquer les messages lus, répondre à une
-- convocation de l'agenda, signaler ou annuler une absence).
-- Les comptes « Pointeuse » (fermée depuis le 9 novembre) passent eux aussi sur leur espace.
--
-- L'encadrement (Direction, Inspection, Ressources humaines) écrit aux fonctionnaires, tient l'agenda et
-- suit les absences ; la Direction et les Ressources humaines publient les notes de service.
--
-- À exécuter après supabase/v29_role_rh.sql. Il peut être exécuté plusieurs fois.

begin;

-- 1. La fiche du fonctionnaire connecté --------------------------------------------------------------------
create or replace function public.mon_fonctionnaire()
returns text
language sql stable security definer
set search_path = ''
as $$
  select f.id from public.registre f
  where f.collection = 'fonctionnaires' and public.mon_discord() is not null
    and f.data->>'discordId' = public.mon_discord()
    and coalesce(f.data->>'actif', 'true') <> 'false'
  order by f.data->>'at' desc nulls last
  limit 1
$$;
revoke all on function public.mon_fonctionnaire() from public, anon;
grant execute on function public.mon_fonctionnaire() to authenticated;

create or replace function public.mon_acces()
returns json
language sql stable security definer
set search_path = ''
as $$
  select json_build_object(
    'discord_id', (select i.provider_id from auth.identities i
                   where i.user_id = auth.uid() and i.provider = 'discord' limit 1),
    'role',       public.mon_role(),
    'nom',        (select a.nom from public.agents a
                   join auth.identities i on i.provider = 'discord' and i.provider_id = a.discord_id
                   where i.user_id = auth.uid() limit 1),
    'fonctionnaire', (select json_build_object('id', f.id, 'nom', f.data->>'nom', 'grade', f.data->>'grade')
                      from public.registre f
                      where f.collection = 'fonctionnaires' and f.id = public.mon_fonctionnaire())
  )
$$;

-- 2. L'espace : tout ce qui concerne le fonctionnaire connecté, et rien d'autre ------------------------------
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
          and coalesce(r.data->>'au', '') >= v_jour), '[]'::jsonb)
  );
end
$$;
revoke all on function public.mon_espace() from public, anon;
grant execute on function public.mon_espace() to authenticated;

-- 3. Écrire à l'encadrement ----------------------------------------------------------------------------------
create or replace function public.envoyer_message(p_texte text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_fid  text := public.mon_fonctionnaire();
  v_nom  text;
  v_id   text;
  v_data jsonb;
  v_txt  text := btrim(coalesce(p_texte, ''));
begin
  if v_fid is null then
    raise exception 'Votre compte Discord n''est relié à aucune fiche de fonctionnaire.' using errcode = '42501';
  end if;
  if v_txt = '' then
    raise exception 'Le message est vide.' using errcode = 'P0001';
  end if;
  if length(v_txt) > 2000 then
    raise exception 'Message trop long : 2 000 caractères au plus.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('guichet-message:' || v_fid));
  if (select count(*) from public.registre r
      where r.collection = 'messagesAgents' and r.data->>'fid' = v_fid and r.data->>'de' = 'agent'
        and r.data->>'at' > to_char((now() - interval '10 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')) >= 20 then
    raise exception 'Trop de messages en peu de temps : patientez quelques minutes.' using errcode = 'P0001';
  end if;
  select f.data->>'nom' into v_nom from public.registre f where f.collection = 'fonctionnaires' and f.id = v_fid;
  v_id := 'm' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSMS') || substr(md5(random()::text || v_fid), 1, 6);
  v_data := jsonb_build_object('fid', v_fid, 'nom', coalesce(v_nom, ''), 'discordId', public.mon_discord(), 'de', 'agent',
                               'auteur', coalesce(v_nom, ''), 'texte', v_txt, 'at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'luEquipe', false);
  insert into public.registre (collection, id, data) values ('messagesAgents', v_id, v_data);
  return jsonb_build_object('id', v_id, 'data', v_data);
end
$$;
revoke all on function public.envoyer_message(text) from public, anon;
grant execute on function public.envoyer_message(text) to authenticated;

-- 4. Marquer lus les messages de l'encadrement -----------------------------------------------------------------
create or replace function public.messages_lus()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_fid text := public.mon_fonctionnaire();
  v_n   integer;
begin
  if v_fid is null then
    return 0;
  end if;
  update public.registre r
     set data = r.data || jsonb_build_object('luAgent', true, 'luAgentLe', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
   where r.collection = 'messagesAgents' and r.data->>'fid' = v_fid and r.data->>'de' = 'equipe'
     and coalesce(r.data->>'luAgent', 'false') <> 'true';
  get diagnostics v_n = row_count;
  return v_n;
end
$$;
revoke all on function public.messages_lus() from public, anon;
grant execute on function public.messages_lus() to authenticated;

-- 5. Répondre à une convocation de l'agenda ---------------------------------------------------------------------
create or replace function public.repondre_agenda(p_id text, p_reponse text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_fid text := public.mon_fonctionnaire();
  v_nom text;
  v_ev  public.registre%rowtype;
begin
  if v_fid is null then
    raise exception 'Votre compte Discord n''est relié à aucune fiche de fonctionnaire.' using errcode = '42501';
  end if;
  if p_reponse is null or p_reponse not in ('oui', 'non', 'peut-etre') then
    raise exception 'Réponse inconnue.' using errcode = 'P0001';
  end if;
  select r.* into v_ev from public.registre r
   where r.collection = 'agenda' and r.id = p_id
     and coalesce(r.data->>'statut', '') <> 'annule'
     and (coalesce(r.data->>'audience', 'tous') = 'tous'
          or (r.data->>'audience' = 'agents' and jsonb_typeof(r.data->'participants') = 'array' and r.data->'participants' ? v_fid))
   for update;
  if not found then
    raise exception 'Cet événement n''existe plus ou ne vous concerne pas.' using errcode = 'P0001';
  end if;
  select f.data->>'nom' into v_nom from public.registre f where f.collection = 'fonctionnaires' and f.id = v_fid;
  update public.registre r
     set data = r.data || jsonb_build_object('reponses',
           (case when jsonb_typeof(r.data->'reponses') = 'object' then r.data->'reponses' else '{}'::jsonb end)
           || jsonb_build_object(v_fid, jsonb_build_object('r', p_reponse, 'nom', coalesce(v_nom, ''), 'at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))))
   where r.collection = 'agenda' and r.id = p_id;
  return jsonb_build_object('id', p_id, 'reponse', p_reponse);
end
$$;
revoke all on function public.repondre_agenda(text, text) from public, anon;
grant execute on function public.repondre_agenda(text, text) to authenticated;

-- 6. Signaler ou annuler une absence -----------------------------------------------------------------------------
create or replace function public.signaler_absence(p_du date, p_au date, p_motif text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_fid  text := public.mon_fonctionnaire();
  v_nom  text;
  v_id   text;
  v_data jsonb;
  v_mot  text := btrim(coalesce(p_motif, ''));
  v_jour date := (now() at time zone 'Europe/Paris')::date;
begin
  if v_fid is null then
    raise exception 'Votre compte Discord n''est relié à aucune fiche de fonctionnaire.' using errcode = '42501';
  end if;
  if p_du is null or p_au is null or p_au < p_du then
    raise exception 'Dates d''absence invalides : la fin doit suivre le début.' using errcode = 'P0001';
  end if;
  if p_au < v_jour - 7 or p_du > v_jour + 120 or p_au - p_du > 60 then
    raise exception 'Une absence se signale au plus 7 jours après, 120 jours avant, et dure 60 jours au plus.' using errcode = 'P0001';
  end if;
  if length(v_mot) > 300 then
    raise exception 'Motif trop long : 300 caractères au plus.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.registre r where r.collection = 'absences' and r.data->>'fid' = v_fid
        and r.data->>'at' > to_char((now() - interval '1 day') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')) >= 10 then
    raise exception 'Trop d''absences signalées aujourd''hui : écrivez plutôt à l''encadrement.' using errcode = 'P0001';
  end if;
  select f.data->>'nom' into v_nom from public.registre f where f.collection = 'fonctionnaires' and f.id = v_fid;
  v_id := 'ab' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSMS') || substr(md5(random()::text || v_fid), 1, 6);
  v_data := jsonb_build_object('fid', v_fid, 'nom', coalesce(v_nom, ''), 'du', to_char(p_du, 'YYYY-MM-DD'), 'au', to_char(p_au, 'YYYY-MM-DD'),
                               'motif', v_mot, 'statut', 'signalee', 'par', 'agent', 'auteur', coalesce(v_nom, ''), 'at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  insert into public.registre (collection, id, data) values ('absences', v_id, v_data);
  return jsonb_build_object('id', v_id, 'data', v_data);
end
$$;
revoke all on function public.signaler_absence(date, date, text) from public, anon;
grant execute on function public.signaler_absence(date, date, text) to authenticated;

create or replace function public.annuler_absence(p_id text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_fid text := public.mon_fonctionnaire();
begin
  if v_fid is null then
    raise exception 'Votre compte Discord n''est relié à aucune fiche de fonctionnaire.' using errcode = '42501';
  end if;
  update public.registre r
     set data = r.data || jsonb_build_object('statut', 'annulee', 'annuleeLe', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'annuleePar', 'agent')
   where r.collection = 'absences' and r.id = p_id and r.data->>'fid' = v_fid
     and coalesce(r.data->>'statut', '') <> 'annulee'
     and r.data->>'au' >= to_char((now() at time zone 'Europe/Paris')::date, 'YYYY-MM-DD');
  if not found then
    raise exception 'Cette absence est déjà passée ou annulée.' using errcode = 'P0001';
  end if;
  return true;
end
$$;
revoke all on function public.annuler_absence(text) from public, anon;
grant execute on function public.annuler_absence(text) to authenticated;

-- 7. Ce que lit l'encadrement : les Ressources humaines lisent aussi messages, agenda, absences et notes ---------
alter table public.agents drop constraint if exists agents_role_check;
alter table public.agents add constraint agents_role_check
  check (role in ('direction', 'inspecteur', 'lecture', 'pointeuse', 'rh'));

drop policy if exists "registre lecture" on public.registre;
create policy "registre lecture" on public.registre for select to authenticated using (
  (select public.mon_role()) in ('direction', 'inspecteur', 'lecture')
  or ((select public.mon_role()) = 'rh'
      and collection in ('config', 'fonctionnaires', 'contratsTravail', 'rh', 'messagesAgents', 'agenda', 'absences', 'notesService'))
  or ((select public.mon_role()) = 'pointeuse' and collection = 'pointages'
      and data->>'discordId' = (select public.mon_discord())
      and now() < timestamptz '2026-11-09 00:00:00 Europe/Paris'));

-- 8. Ce qu'écrit l'encadrement : l'Inspection écrit aussi messages, agenda et absences ---------------------------
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
      -- Encadrement des fonctionnaires : messages, agenda et absences.
      or p_collection in ('messagesAgents', 'agenda', 'absences')
      or (p_collection = 'declarations' and not exists (
            select 1 from public.registre r
            where r.collection = 'decisions' and r.id = p_id and r.data->>'statut' = 'payee'))
    -- Ressources humaines : les fiches des fonctionnaires, leurs contrats de travail et le modèle de contrat.
    when 'rh' then p_collection in ('fonctionnaires', 'contratsTravail', 'rh', 'messagesAgents', 'agenda', 'absences', 'notesService')
    else false
  end
$$;
revoke all on function public.ecriture_permise(text, text, jsonb) from public, anon;
grant execute on function public.ecriture_permise(text, text, jsonb) to authenticated;

commit;
