-- Guichet fiscal : mise à jour 53 (arrêtés préfectoraux rédigés par les ressources humaines)
--
-- Les arrêtés préfectoraux (collection « arretes » du registre) se rédigent dans l'onglet Personnel, à partir
-- d'un modèle : visas, considérants et articles choisis dans une bibliothèque. Le rédacteur signe et transmet,
-- puis le préfet choisi signe depuis sa propre session.
--
-- La Direction lit et écrit déjà tout le registre : sans cette mise à jour, elle rédige, signe et publie les
-- arrêtés. Celle-ci ouvre les arrêtés aux ressources humaines :
-- 1. lecture de tous les arrêtés ;
-- 2. écriture d'un arrêté tant qu'il n'est pas signé par le préfet (brouillon, ou signé par le rédacteur et
--    en attente du préfet), sans pouvoir y mettre la signature du préfet ;
-- 3. suppression d'un projet d'arrêté (brouillon ou en attente), jamais d'un arrêté signé ou abrogé.
--
-- Indépendante de la mise à jour 52 : elle peut être exécutée avant ou après. Elle peut être exécutée
-- plusieurs fois.

begin;

-- 1. Ce que les RH peuvent écrire dans un arrêté -------------------------------------------------------------
create or replace function public.arrete_rh_ok(p_id text, p_data jsonb)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(p_data->>'statut', 'brouillon') in ('brouillon', 'a_signer')
    and coalesce(p_data->'prefet'->>'signeLe', '') = ''
    and not exists (select 1 from public.registre r
                    where r.collection = 'arretes' and r.id = p_id
                      and coalesce(r.data->>'statut', 'brouillon') not in ('brouillon', 'a_signer'))
$$;
revoke all on function public.arrete_rh_ok(text, jsonb) from public, anon;
grant execute on function public.arrete_rh_ok(text, jsonb) to authenticated;

-- 2. Écriture : comme la mise à jour 36, plus les arrêtés pour les RH ----------------------------------------
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
      -- Les arrêtés préfectoraux, jusqu'à la signature du préfet (mise à jour 53).
      or (p_collection = 'arretes' and public.arrete_rh_ok(p_id, p_data))
    else false
  end
$$;
revoke all on function public.ecriture_permise(text, text, jsonb) from public, anon;
grant execute on function public.ecriture_permise(text, text, jsonb) to authenticated;

-- 3. Lecture : comme la mise à jour 42, plus les arrêtés pour les RH ------------------------------------------
drop policy if exists "registre lecture" on public.registre;
create policy "registre lecture" on public.registre for select to authenticated using (
  (select public.mon_role()) in ('direction', 'inspecteur', 'lecture')
  or ((select public.mon_role()) = 'rh'
      and (collection in ('config', 'fonctionnaires', 'contratsTravail', 'rh', 'messagesAgents', 'agenda', 'absences', 'notesService', 'sanctions', 'demandesAgents', 'entretiens',
                          'securiteEntrees', 'securiteControles', 'securiteRapports', 'securiteSignalements', 'securiteAttendus', 'arretes')
           or (collection = 'rappels' and data->>'origine' = 'retenue' and coalesce(data->>'sanction', '') <> '')))
  or ((select public.mon_role()) = 'pointeuse' and collection = 'pointages'
      and data->>'discordId' = (select public.mon_discord())
      and now() < timestamptz '2026-11-09 00:00:00 Europe/Paris')
  or (collection in ('securiteEntrees', 'securiteControles', 'securiteRapports', 'securiteSignalements', 'securiteAttendus')
      and (select public.ma_protection()) is not null));

-- 4. Suppression : comme la mise à jour 42, plus les projets d'arrêtés pour les RH -----------------------------
drop policy if exists "registre suppression" on public.registre;
create policy "registre suppression" on public.registre for delete to authenticated using (
  (select public.mon_role()) = 'direction'
  or ((select public.mon_role()) = 'rh' and collection = 'contratsTravail' and coalesce(data->>'statut', '') <> 'signe')
  or ((select public.mon_role()) = 'rh' and collection = 'arretes' and coalesce(data->>'statut', 'brouillon') in ('brouillon', 'a_signer'))
  or (collection in ('securiteEntrees', 'securiteControles', 'securiteRapports', 'securiteSignalements', 'securiteAttendus')
      and (select public.ma_protection()) = 'responsable'));

commit;
