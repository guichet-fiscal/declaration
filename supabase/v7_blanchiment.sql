-- Guichet fiscal : mise à jour 7 · Surveillance des comptes (lutte contre le blanchiment)
--
-- À exécuter une fois dans Supabase → SQL Editor, après la mise à jour 6.
-- Le script peut être relancé sans risque.
--
-- Les relevés de compte et les déclarations de soupçon sont rangés dans le registre
-- (collections « releves » et « soupcons ») ; les captures vont dans l'espace privé
-- « pieces » créé par la mise à jour 5. Ce script ne fait qu'une chose : il permet à
-- l'Inspection d'enregistrer un relevé de compte. La déclaration de soupçon reste
-- réservée à la Direction.

create or replace function public.ecriture_permise(p_collection text, p_id text, p_data jsonb)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case public.mon_role()
    when 'direction' then true
    when 'inspecteur' then
      p_collection in ('demandes', 'relances', 'releves')
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
