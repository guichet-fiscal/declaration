-- Guichet fiscal : mise à jour 29 (rôle « Ressources humaines »)
--
-- Un nouveau rôle, « rh », pour la personne chargée du personnel de la Préfecture. Elle :
--  - ajoute, modifie, retire des effectifs et réintègre les fonctionnaires (collection « fonctionnaires ») ;
--  - établit, modifie, fait signer et supprime (tant qu'ils ne sont pas signés) leurs contrats de travail
--    (collection « contratsTravail ») et règle le modèle de contrat (collection « rh ») ;
--  - lit ces trois collections et les réglages du guichet (barème des grades et taux horaires).
-- Elle ne lit ni ne modifie rien d'autre : ni la paye, ni les pointages, ni les entreprises, ni le journal.
-- Chaque changement reste inscrit au journal, que la Direction consulte.
--
-- Le script donne ce rôle à Mathys MARQUINA (compte Discord 916695949978525766), aujourd'hui « Pointeuse ».
-- La Direction peut ensuite le donner ou le retirer dans Réglages → Accès.
--
-- À exécuter après supabase/v27_fermeture_pointeuse.sql. Il peut être exécuté plusieurs fois.

begin;

-- 1. Le rôle -------------------------------------------------------------------------------------------
alter table public.agents drop constraint if exists agents_role_check;
alter table public.agents add constraint agents_role_check
  check (role in ('direction', 'inspecteur', 'lecture', 'pointeuse', 'rh'));

-- 2. Ce que lit chacun : le rôle « rh » lit le personnel, ses contrats et les réglages ----------------------
drop policy if exists "registre lecture" on public.registre;
create policy "registre lecture" on public.registre for select to authenticated using (
  (select public.mon_role()) in ('direction', 'inspecteur', 'lecture')
  or ((select public.mon_role()) = 'rh' and collection in ('config', 'fonctionnaires', 'contratsTravail', 'rh'))
  or ((select public.mon_role()) = 'pointeuse' and collection = 'pointages'
      and data->>'discordId' = (select public.mon_discord())
      and now() < timestamptz '2026-11-09 00:00:00 Europe/Paris'));

-- 3. Ce qu'écrit chacun : le rôle « rh » écrit le personnel, ses contrats et le modèle -----------------------
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
      or (p_collection = 'declarations' and not exists (
            select 1 from public.registre r
            where r.collection = 'decisions' and r.id = p_id and r.data->>'statut' = 'payee'))
    -- Ressources humaines : les fiches des fonctionnaires, leurs contrats de travail et le modèle de contrat.
    when 'rh' then p_collection in ('fonctionnaires', 'contratsTravail', 'rh')
    else false
  end
$$;
revoke all on function public.ecriture_permise(text, text, jsonb) from public, anon;
grant execute on function public.ecriture_permise(text, text, jsonb) to authenticated;

-- 4. Suppressions : la Direction, et les ressources humaines pour un contrat de travail pas encore signé -----
drop policy if exists "registre suppression" on public.registre;
create policy "registre suppression" on public.registre for delete to authenticated using (
  (select public.mon_role()) = 'direction'
  or ((select public.mon_role()) = 'rh' and collection = 'contratsTravail' and coalesce(data->>'statut', '') <> 'signe'));

-- 5. Mathys MARQUINA prend le rôle -----------------------------------------------------------------------------
update public.agents set role = 'rh' where discord_id = '916695949978525766';

commit;
