-- Guichet fiscal : mise à jour 6 · Travail à plusieurs en direct
--
-- À exécuter une fois dans Supabase → SQL Editor, après les mises à jour 3, 4 et 5.
-- Le script peut être relancé sans risque.
--
-- Le registre arrive déjà en direct chez chaque agent (schema.sql). Ce script ajoute :
--  1. le journal en direct : l'onglet Journal se remplit tout seul et le site sait
--     quel agent vient de modifier un dossier ;
--  2. la présence : qui est connecté et quel dossier il consulte. Elle passe par un
--     salon privé que seuls les agents du guichet peuvent rejoindre ;
--  3. les déclarations rectificatives saisies par l'Inspection : la déclaration
--     remplacée est rejetée d'elle-même (rien d'autre ne change dans les droits).

-- 1. Journal en direct -----------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.journal;
exception when duplicate_object then null;
end
$$;

-- 2. Présence des agents ---------------------------------------------------
-- Le salon « guichet:presence » est privé : Supabase n'y admet que les connexions
-- dont l'agent figure dans la table des accès (quel que soit son rôle).
drop policy if exists "guichet presence lecture" on realtime.messages;
create policy "guichet presence lecture" on realtime.messages
  for select to authenticated
  using (realtime.topic() = 'guichet:presence' and public.mon_role() is not null);

drop policy if exists "guichet presence envoi" on realtime.messages;
create policy "guichet presence envoi" on realtime.messages
  for insert to authenticated
  with check (realtime.topic() = 'guichet:presence' and public.mon_role() is not null);

-- 3. Déclarations rectificatives -------------------------------------------
-- Même règle qu'en mise à jour 4, avec un seul ajout : l'Inspection peut marquer
-- « rejetée » une déclaration remplacée par une rectificative (champ remplaceePar).
create or replace function public.ecriture_permise(p_collection text, p_id text, p_data jsonb)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case public.mon_role()
    when 'direction' then true
    when 'inspecteur' then
      p_collection in ('demandes', 'relances')
      or (p_collection = 'attestations' and p_data->>'revoqueeLe' is null)
      or (p_collection = 'controles' and coalesce(p_data->>'statut', '') in ('ouvert', 'propose', 'sans_suite'))
      or (p_collection = 'decisions' and coalesce(p_data->>'statut', '') in ('validee', 'controle'))
      or (p_collection = 'decisions' and p_data->>'statut' = 'rejetee' and coalesce(p_data->>'remplaceePar', '') <> ''
          and not exists (select 1 from public.registre r
                          where r.collection = 'decisions' and r.id = p_id and r.data->>'statut' = 'payee'))
      or (p_collection = 'declarations' and not exists (
            select 1 from public.registre r
            where r.collection = 'decisions' and r.id = p_id and r.data->>'statut' = 'payee'))
    else false
  end
$$;
revoke all on function public.ecriture_permise(text, text, jsonb) from public, anon;
grant execute on function public.ecriture_permise(text, text, jsonb) to authenticated;
