-- Guichet fiscal : mise à jour 47 (taxe sur les véhicules de société, montant estimé dans l'espace entreprise)
--
-- La taxe sur les véhicules de société est une option des réglages (Véhicules de société), désactivée par
-- défaut : un montant par véhicule et par période selon son type, ajouté à l'avis d'imposition. Le guichet la
-- calcule seul ; ce script sert seulement à l'espace entreprise, pour que le montant estimé d'une déclaration
-- en ligne la compte : la fonction vehicules_entreprise donne au patron, avec son lien, l'option (activée ou
-- non, montants par type) et les véhicules de son entreprise (plaque, modèle, type, dates d'achat et de sortie).
-- Sans ce script, le montant estimé de l'espace entreprise ne compte pas la taxe ; l'avis, lui, la compte.
--
-- À exécuter après supabase/v46_lettres_delais.sql. Il peut être exécuté plusieurs fois.

begin;

create or replace function public.vehicules_entreprise(p_jeton text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  eid text := public.entreprise_du_jeton(p_jeton);
  c   jsonb;
begin
  if eid is null then
    return null;
  end if;
  select r.data->'vehicules' into c from public.registre r where r.collection = 'config' and r.id = 'main';
  c := coalesce(c, '{}'::jsonb);
  return jsonb_build_object(
    'taxe', coalesce(c->'taxe', 'false'::jsonb) = 'true'::jsonb,
    'montants', coalesce(c->'taxeMontants', '{}'::jsonb),
    'vehicules', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'entrepriseId', eid, 'plaque', v.data->>'plaque', 'modele', v.data->>'modele',
               'categorie', v.data->>'categorie', 'achatLe', v.data->>'achatLe', 'createdAt', v.data->>'createdAt',
               'statut', v.data->>'statut', 'vente', jsonb_build_object('at', v.data->'vente'->>'at'),
               'saisiLe', v.data->>'saisiLe', 'requalification', jsonb_build_object('at', v.data->'requalification'->>'at')))
        from public.registre v
       where v.collection = 'vehicules' and v.data->>'entrepriseId' = eid), '[]'::jsonb));
end
$$;
revoke all on function public.vehicules_entreprise(text) from public;
grant execute on function public.vehicules_entreprise(text) to anon, authenticated;

commit;
