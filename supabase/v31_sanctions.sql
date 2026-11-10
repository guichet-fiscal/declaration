-- Guichet fiscal : mise à jour 31 (sanctions disciplinaires)
--
-- La Direction et les ressources humaines prennent des sanctions contre les fonctionnaires
-- (collection « sanctions ») : avertissement, blâme, retenue sur salaire, exclusion temporaire,
-- rétrogradation, révocation. Chaque fonctionnaire voit ses sanctions (sauf annulées) dans son espace.
--  1. « mon_espace » renvoie aussi ses sanctions ;
--  2. les ressources humaines lisent et écrivent les sanctions, et lisent et écrivent la retenue sur
--     salaire d'une sanction (une retenue de la collection « rappels » marquée de la sanction), rien
--     d'autre de la paye.
-- L'Inspection lit les sanctions mais n'en prend pas.
--
-- À exécuter après supabase/v30_espace_agents.sql. Il peut être exécuté plusieurs fois.

begin;

-- 1. L'espace du fonctionnaire, avec ses sanctions ---------------------------------------------------------------
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
          and coalesce(r.data->>'statut', '') <> 'annulee'), '[]'::jsonb)
  );
end
$$;
revoke all on function public.mon_espace() from public, anon;
grant execute on function public.mon_espace() to authenticated;

-- 2. Lecture : les ressources humaines lisent les sanctions et les retenues des sanctions -------------------------
drop policy if exists "registre lecture" on public.registre;
create policy "registre lecture" on public.registre for select to authenticated using (
  (select public.mon_role()) in ('direction', 'inspecteur', 'lecture')
  or ((select public.mon_role()) = 'rh'
      and (collection in ('config', 'fonctionnaires', 'contratsTravail', 'rh', 'messagesAgents', 'agenda', 'absences', 'notesService', 'sanctions')
           or (collection = 'rappels' and data->>'origine' = 'retenue' and coalesce(data->>'sanction', '') <> '')))
  or ((select public.mon_role()) = 'pointeuse' and collection = 'pointages'
      and data->>'discordId' = (select public.mon_discord())
      and now() < timestamptz '2026-11-09 00:00:00 Europe/Paris'));

-- 3. Écriture : les ressources humaines écrivent les sanctions et leurs retenues ---------------------------------
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
    when 'rh' then p_collection in ('fonctionnaires', 'contratsTravail', 'rh', 'messagesAgents', 'agenda', 'absences', 'notesService', 'sanctions')
      -- La retenue sur salaire d'une sanction (et rien d'autre de la paye).
      or (p_collection = 'rappels' and p_data->>'origine' = 'retenue' and coalesce(p_data->>'sanction', '') <> '')
    else false
  end
$$;
revoke all on function public.ecriture_permise(text, text, jsonb) from public, anon;
grant execute on function public.ecriture_permise(text, text, jsonb) to authenticated;

commit;
