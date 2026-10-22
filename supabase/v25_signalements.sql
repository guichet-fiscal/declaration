-- Guichet fiscal : mise à jour 25 (signalements depuis l'espace entreprise)
--
-- Dans son espace (le lien personnel de l'entreprise), un patron peut signaler une fraude : l'entreprise
-- ou la personne visée, ce qu'il a constaté, son nom RP s'il veut une prime d'aviseur, le lien d'une
-- preuve. Le signalement arrive dans le guichet (dossiers à traiter) : un agent ouvre un contrôle sur
-- signalement, l'aviseur prérempli, ou le classe avec un motif. L'entreprise visée n'en sait rien.
--
-- Au plus 5 signalements par heure et par entreprise.
--
-- À exécuter après supabase/v24_sauvegarde_nocturne.sql (ou v21 au moins). Il peut être exécuté plusieurs fois.

begin;

create or replace function public.signaler_fraude(p_jeton text, p_signalement jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  eid text; e jsonb; vis text; txt text; aut text; prv text; sid text; maintenant text;
begin
  eid := public.entreprise_du_jeton(p_jeton);
  if eid is null then raise exception 'Lien inconnu ou coupé : demandez un nouveau lien à la Préfecture.'; end if;
  select r.data into e from public.registre r where r.collection = 'entreprises' and r.id = eid;
  if e is null then raise exception 'Entreprise introuvable.'; end if;
  if jsonb_typeof(p_signalement) <> 'object' or length(p_signalement::text) > 6000 then raise exception 'Signalement illisible.'; end if;
  vis := left(trim(coalesce(p_signalement->>'visee', '')), 120);
  txt := left(trim(coalesce(p_signalement->>'texte', '')), 3000);
  aut := left(trim(coalesce(p_signalement->>'auteur', '')), 80);
  prv := nullif(trim(coalesce(p_signalement->>'preuve', '')), '');
  if vis = '' then raise exception 'Indiquez l’entreprise ou la personne visée.'; end if;
  if length(txt) < 20 then raise exception 'Décrivez ce que vous avez constaté (20 caractères au moins).'; end if;
  if prv is not null and (prv !~ '^https://\S+$' or length(prv) > 500) then raise exception 'Lien de la preuve invalide : il doit commencer par https://'; end if;
  if (select count(*) from public.registre r where r.collection = 'signalements' and r.data->>'parId' = eid and r.updated_at > now() - interval '1 hour') >= 5 then
    raise exception 'Trop de signalements : réessayez dans une heure.';
  end if;
  maintenant := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  sid := 'sig' || substr(md5(eid || ':' || clock_timestamp()::text || ':' || random()::text), 1, 17);
  insert into public.registre (collection, id, data)
  values ('signalements', sid, jsonb_strip_nulls(jsonb_build_object(
    'parId', eid, 'parNom', e->>'nom', 'visee', vis, 'texte', txt, 'auteur', nullif(aut, ''), 'preuve', prv,
    'statut', 'recu', 'enLigne', true, 'recuLe', maintenant)));
  return jsonb_build_object('id', sid, 'recuLe', maintenant);
end
$$;
revoke all on function public.signaler_fraude(text, jsonb) from public;
grant execute on function public.signaler_fraude(text, jsonb) to anon, authenticated;

-- L'Inspection traite les signalements reçus (contrôle ouvert ou classement) : droits d'écriture de la
-- mise à jour 21, plus les signalements.
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
    else false
  end
$$;
revoke all on function public.ecriture_permise(text, text, jsonb) from public, anon;
grant execute on function public.ecriture_permise(text, text, jsonb) to authenticated;

commit;
