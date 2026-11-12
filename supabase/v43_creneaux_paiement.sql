-- Guichet fiscal : mise à jour 43 (créneaux de paiement réservés depuis l'espace entreprise)
--
-- La Direction ouvre des permanences de paiement (onglet Convocations : un créneau par tranche de 15, 20,
-- 30 ou 60 minutes, collection « creneaux » du registre). Le patron, depuis son espace entreprise, voit
-- les créneaux libres des 15 prochains jours, en réserve un pour venir payer (avec l'objet) et peut
-- l'annuler tant qu'il n'est pas passé. Il ne voit jamais quelle autre entreprise a pris un créneau : un
-- créneau pris par une autre n'est pas montré.
-- Deux créneaux à venir au plus par entreprise.
--
-- À exécuter après supabase/v42_signalements_attendus.sql. Il peut être exécuté plusieurs fois.

begin;

-- 1. Les créneaux vus par une entreprise : les libres, et les siens ------------------------------------
create or replace function public.creneaux_entreprise(p_jeton text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  eid text := public.entreprise_du_jeton(p_jeton);
begin
  if eid is null then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'debut', r.data->>'debut', 'fin', r.data->>'fin', 'lieu', r.data->>'lieu',
             'moi', coalesce(r.data->>'entrepriseId', '') = eid,
             'objet', case when r.data->>'entrepriseId' = eid then r.data->>'objet' end)
           order by r.data->>'debut')
    from public.registre r
    where r.collection = 'creneaux'
      and coalesce(r.data->>'statut', 'ouvert') = 'ouvert'
      and coalesce(r.data->>'debut', '') ~ '^\d{4}-\d{2}-\d{2}T'
      and (r.data->>'debut')::timestamptz > now() - interval '2 hours'
      and (r.data->>'debut')::timestamptz < now() + interval '15 days'
      and (coalesce(r.data->>'entrepriseId', '') = '' or r.data->>'entrepriseId' = eid)), '[]'::jsonb);
end
$$;
revoke all on function public.creneaux_entreprise(text) from public;
grant execute on function public.creneaux_entreprise(text) to anon, authenticated;

-- 2. Réserver un créneau libre ----------------------------------------------------------------------------
create or replace function public.reserver_creneau(p_jeton text, p_creneau text, p_objet text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  eid  text := public.entreprise_du_jeton(p_jeton);
  v    jsonb;
  nom  text;
  obj  text := left(btrim(coalesce(p_objet, '')), 200);
  n    integer;
  v_at text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if eid is null then
    raise exception 'Lien inconnu ou coupé.' using errcode = '28000';
  end if;
  perform pg_advisory_xact_lock(hashtext('guichet-creneau:' || coalesce(p_creneau, '')));
  select r.data into v from public.registre r where r.collection = 'creneaux' and r.id = p_creneau for update;
  if v is null or coalesce(v->>'statut', 'ouvert') <> 'ouvert' or coalesce(v->>'debut', '') !~ '^\d{4}-\d{2}-\d{2}T' then
    raise exception 'Ce créneau n''existe plus.' using errcode = 'P0001';
  end if;
  if (v->>'debut')::timestamptz <= now() then
    raise exception 'Ce créneau est déjà passé.' using errcode = 'P0001';
  end if;
  if coalesce(v->>'entrepriseId', '') = eid then
    return jsonb_build_object('id', p_creneau, 'deja', true);
  end if;
  if coalesce(v->>'entrepriseId', '') <> '' then
    raise exception 'Ce créneau vient d''être pris : choisissez-en un autre.' using errcode = 'P0001';
  end if;
  select count(*) into n from public.registre r
   where r.collection = 'creneaux' and r.data->>'entrepriseId' = eid and coalesce(r.data->>'statut', 'ouvert') = 'ouvert'
     and coalesce(r.data->>'debut', '') ~ '^\d{4}-\d{2}-\d{2}T' and (r.data->>'debut')::timestamptz > now();
  if n >= 2 then
    raise exception 'Vous avez déjà deux rendez-vous à venir : annulez-en un d''abord.' using errcode = 'P0001';
  end if;
  select e.data->>'nom' into nom from public.registre e where e.collection = 'entreprises' and e.id = eid;
  update public.registre
     set data = data || jsonb_build_object('entrepriseId', eid, 'entrepriseNom', coalesce(nom, ''), 'objet', obj, 'reserveLe', v_at)
   where collection = 'creneaux' and id = p_creneau;
  return jsonb_build_object('id', p_creneau, 'reserveLe', v_at);
end
$$;
revoke all on function public.reserver_creneau(text, text, text) from public;
grant execute on function public.reserver_creneau(text, text, text) to anon, authenticated;

-- 3. Annuler sa réservation (avant l'heure) ---------------------------------------------------------------
create or replace function public.annuler_creneau(p_jeton text, p_creneau text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  eid text := public.entreprise_du_jeton(p_jeton);
  v   jsonb;
begin
  if eid is null then
    raise exception 'Lien inconnu ou coupé.' using errcode = '28000';
  end if;
  select r.data into v from public.registre r where r.collection = 'creneaux' and r.id = p_creneau for update;
  if v is null or coalesce(v->>'entrepriseId', '') <> eid then
    return false;
  end if;
  if coalesce(v->>'debut', '') ~ '^\d{4}-\d{2}-\d{2}T' and (v->>'debut')::timestamptz <= now() then
    raise exception 'Ce rendez-vous est déjà passé.' using errcode = 'P0001';
  end if;
  update public.registre
     set data = (data - 'entrepriseId' - 'entrepriseNom' - 'objet' - 'reserveLe')
                || jsonb_build_object('annuleParEntreprise', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
   where collection = 'creneaux' and id = p_creneau;
  return true;
end
$$;
revoke all on function public.annuler_creneau(text, text) from public;
grant execute on function public.annuler_creneau(text, text) to anon, authenticated;

commit;
