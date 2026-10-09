-- Guichet fiscal : mise à jour 9 · Véhicules de société
--
-- À exécuter une fois dans Supabase → SQL Editor, après la mise à jour 8.
-- Le script peut être relancé sans risque.
--
-- Les véhicules sont rangés dans le registre (collection « vehicules »). L'Inspection peut
-- enregistrer un véhicule, le modifier, ajouter sa facture, un contrôle de police ou sa vente.
-- Seule la Direction valide une affectation, requalifie un véhicule en véhicule personnel du
-- dirigeant, ou le marque saisi : ces décisions, une fois prises, ne peuvent pas être changées
-- par l'Inspection. L'Inspection ne peut pas non plus effacer un contrôle de police déjà
-- enregistré, ni revenir sur une vente.

-- Ce que l'Inspection peut écrire sur un véhicule, comparé à ce qui est enregistré.
create or replace function public.vehicule_inspection_ok(p_id text, p_data jsonb)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  with avant as (
    select (select r.data from public.registre r where r.collection = 'vehicules' and r.id = p_id) as d
  )
  select coalesce(p_data->>'statut', 'service') in ('service', 'vendu')
     and (p_data->'validation') is not distinct from (avant.d->'validation')
     and (p_data->'requalification') is not distinct from (avant.d->'requalification')
     and coalesce(p_data->'constats', '[]'::jsonb) @> coalesce(avant.d->'constats', '[]'::jsonb)
     and (coalesce(avant.d->>'statut', 'service') <> 'vendu'
          or (p_data->>'statut' = 'vendu' and (p_data->'vente') is not distinct from (avant.d->'vente')))
  from avant
$$;
revoke all on function public.vehicule_inspection_ok(text, jsonb) from public, anon;
grant execute on function public.vehicule_inspection_ok(text, jsonb) to authenticated;

create or replace function public.ecriture_permise(p_collection text, p_id text, p_data jsonb)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case public.mon_role()
    when 'direction' then true
    when 'inspecteur' then
      p_collection in ('demandes', 'relances', 'releves')
      or (p_collection = 'prets' and p_data->>'statut' in ('demande', 'annule'))
      or (p_collection = 'vehicules' and public.vehicule_inspection_ok(p_id, p_data))
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
