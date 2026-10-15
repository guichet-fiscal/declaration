-- Guichet fiscal : mise à jour 22 (espace entreprise : convocations et attestation)
--
-- L'espace entreprise (mise à jour 21) montre aussi au patron ses convocations (date, lieu, objet,
-- état, convocation en image) et ses attestations de régularité : la dernière en cours de validité se
-- télécharge en image. Rien d'autre ne change ; les mêmes règles valent (son entreprise seulement).
--
-- À exécuter après supabase/v21_espace_entreprise.sql. Il peut être exécuté plusieurs fois.

begin;

create or replace function public.espace_entreprise(p_jeton text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  eid text; e jsonb; c jsonb; n text;
begin
  eid := public.entreprise_du_jeton(p_jeton);
  if eid is null then return null; end if;
  select r.data into e from public.registre r where r.collection = 'entreprises' and r.id = eid;
  if e is null then return null; end if;
  update public.liens_entreprises set derniere_visite = now() where entreprise_id = eid;
  n := lower(trim(e->>'nom'));
  select r.data into c from public.registre r where r.collection = 'config' and r.id = 'main';
  c := coalesce(c, '{}'::jsonb);
  return jsonb_build_object(
    'maintenant', now(),
    'entreprise', jsonb_build_object('id', eid) || (e - 'fermeMotif'),
    -- Réglages utiles au calcul de l'impôt et des dates limites, rien d'autre.
    'config', coalesce((select jsonb_object_agg(x.k, x.v) from jsonb_each(c) as x(k, v)
       where x.k = any (array['periodicite', 'delaiJours', 'delaiPaiementJours', 'tauxIS', 'tauxCot', 'majoration', 'majorationImpaye',
                              'baremeIS', 'baremeCot', 'baremeMode', 'baremeCotBase', 'salaireMin', 'exoActive', 'exoIS', 'exoCot',
                              'exoPeriodes', 'exoDegressif', 'debutSuivi', 'devise'])), '{}'::jsonb)
      || case when c ? 'blanchiment' then jsonb_build_object('blanchiment', jsonb_build_object('soldeObligatoire', coalesce(c->'blanchiment'->'soldeObligatoire', 'false'::jsonb))) else '{}'::jsonb end,
    'declarations', coalesce((select jsonb_agg(jsonb_build_object('id', d.id) || (d.data - 'saisiPar') order by d.data->>'periode')
       from public.registre d where d.collection = 'declarations'
         and (d.data->>'entrepriseId' = eid or (coalesce(d.data->>'entrepriseId', '') = '' and lower(trim(d.data->>'entrepriseNom')) = n))), '[]'::jsonb),
    -- Un avis suspendu par un contrôle ne dit pas lequel : la note interne est retirée.
    'decisions', coalesce((select jsonb_object_agg(x.id, case when x.data->>'statut' = 'controle' then x.data - 'note' - 'by' else x.data - 'by' end)
       from public.registre x where x.collection = 'decisions' and x.id in (
         select d.id from public.registre d where d.collection = 'declarations'
           and (d.data->>'entrepriseId' = eid or (coalesce(d.data->>'entrepriseId', '') = '' and lower(trim(d.data->>'entrepriseNom')) = n)))), '{}'::jsonb),
    'echeanciers', coalesce((select jsonb_object_agg(x.id, x.data)
       from public.registre x where x.collection = 'echeanciers' and x.id in (
         select d.id from public.registre d where d.collection = 'declarations'
           and (d.data->>'entrepriseId' = eid or (coalesce(d.data->>'entrepriseId', '') = '' and lower(trim(d.data->>'entrepriseNom')) = n)))), '{}'::jsonb),
    'penalites', coalesce((select jsonb_agg(jsonb_build_object('id', x.id) || (x.data - 'by'))
       from public.registre x where x.collection = 'penalites'
         and (x.data->>'entrepriseId' = eid or (coalesce(x.data->>'entrepriseId', '') = '' and lower(trim(x.data->>'entrepriseNom')) = n))), '[]'::jsonb),
    'relances', coalesce((select jsonb_agg(jsonb_build_object('id', x.id) || (x.data - 'by'))
       from public.registre x where x.collection = 'relances'
         and (x.data->>'entrepriseId' = eid or (coalesce(x.data->>'entrepriseId', '') = '' and lower(trim(x.data->>'entrepriseNom')) = n))), '[]'::jsonb),
    'prets', coalesce((select jsonb_agg(jsonb_build_object('id', x.id) || (x.data - 'by'))
       from public.registre x where x.collection = 'prets'
         and (x.data->>'entrepriseId' = eid or (coalesce(x.data->>'entrepriseId', '') = '' and lower(trim(x.data->>'entrepriseNom')) = n))), '[]'::jsonb),
    'depots', coalesce((select jsonb_agg(jsonb_build_object('id', x.id) || x.data)
       from public.registre x where x.collection = 'depots' and x.data->>'entrepriseId' = eid), '[]'::jsonb),
    'clotures', coalesce((select jsonb_agg(x.id) from public.registre x where x.collection = 'clotures'), '[]'::jsonb),
    -- Mise à jour 22 : ses convocations et ses attestations de régularité.
    'convocations', coalesce((select jsonb_agg(jsonb_build_object('id', x.id) || (x.data - 'by') order by x.data->>'date' desc)
       from public.registre x where x.collection = 'convocations'
         and (x.data->>'entrepriseId' = eid or (coalesce(x.data->>'entrepriseId', '') = '' and lower(trim(x.data->>'entrepriseNom')) = n))), '[]'::jsonb),
    'attestations', coalesce((select jsonb_agg(jsonb_build_object('id', x.id) || (x.data - 'by') order by x.data->>'at' desc)
       from public.registre x where x.collection = 'attestations'
         and (x.data->>'entrepriseId' = eid or (coalesce(x.data->>'entrepriseId', '') = '' and lower(trim(x.data->>'entrepriseNom')) = n))), '[]'::jsonb)
  );
end
$$;
revoke all on function public.espace_entreprise(text) from public;
grant execute on function public.espace_entreprise(text) to anon, authenticated;

commit;
