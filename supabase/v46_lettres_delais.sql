-- Guichet fiscal : mise à jour 46 (accusé de lecture des lettres, demandes de délai de paiement)
--
-- 1. Lettres : le patron voit déjà ses rappels, relances et mises en demeure dans son espace entreprise.
--    Désormais, le guichet note quand il les a ouvertes (« vueLe », à l'affichage de son espace) et quand il
--    a cliqué « J'ai pris connaissance » (« accuseLe ») : fonction relance_vue.
-- 2. Délais de paiement : depuis son espace, le patron demande à payer un avis en plusieurs fois (2 à 4)
--    ou plus tard (2, 4 ou 7 jours), avec un motif (collection « delais » du registre). Une seule demande
--    en attente à la fois ; il peut l'annuler. La Direction accepte (échéancier) ou refuse dans le
--    guichet ; pendant la demande, le recouvrement de ces avis est suspendu (pas de relance automatique).
--
-- À exécuter après supabase/v45_signalements_agents.sql. Il peut être exécuté plusieurs fois.

begin;

-- 1. Lettre ouverte, lettre lue ---------------------------------------------------------------------------
create or replace function public.relance_vue(p_jeton text, p_relance text, p_accuse boolean)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  eid text := public.entreprise_du_jeton(p_jeton);
  v   jsonb;
  m   text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if eid is null then
    raise exception 'Lien inconnu ou coupé : demandez un nouveau lien à la Préfecture.' using errcode = '28000';
  end if;
  select r.data into v from public.registre r where r.collection = 'relances' and r.id = p_relance;
  if v is null or coalesce(v->>'entrepriseId', '') <> eid then
    return null;
  end if;
  if coalesce(v->>'vueLe', '') = '' or (coalesce(p_accuse, false) and coalesce(v->>'accuseLe', '') = '') then
    update public.registre
       set data = data || jsonb_build_object('vueLe', coalesce(nullif(v->>'vueLe', ''), m))
                       || case when coalesce(p_accuse, false) then jsonb_build_object('accuseLe', coalesce(nullif(v->>'accuseLe', ''), m)) else '{}'::jsonb end
     where collection = 'relances' and id = p_relance;
  end if;
  return jsonb_build_object('vueLe', coalesce(nullif(v->>'vueLe', ''), m),
                            'accuseLe', case when coalesce(p_accuse, false) then coalesce(nullif(v->>'accuseLe', ''), m) else nullif(v->>'accuseLe', '') end);
end
$$;
revoke all on function public.relance_vue(text, text, boolean) from public;
grant execute on function public.relance_vue(text, text, boolean) to anon, authenticated;

-- 2. Demandes de délai de paiement --------------------------------------------------------------------------
create or replace function public.demander_delai(p_jeton text, p_decls text[], p_mode text, p_nb integer, p_jours integer, p_motif text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  eid  text := public.entreprise_du_jeton(p_jeton);
  e    jsonb;
  mot  text := left(btrim(coalesce(p_motif, '')), 500);
  ids  text[];
  did  text;
  m    text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if eid is null then
    raise exception 'Lien inconnu ou coupé : demandez un nouveau lien à la Préfecture.' using errcode = '28000';
  end if;
  select r.data into e from public.registre r where r.collection = 'entreprises' and r.id = eid;
  if e is null then raise exception 'Entreprise introuvable.'; end if;
  if p_mode not in ('plusieurs', 'report') then raise exception 'Choisissez : en plusieurs fois, ou plus tard.'; end if;
  if p_mode = 'plusieurs' and coalesce(p_nb, 0) not between 2 and 4 then raise exception 'En 2, 3 ou 4 fois.'; end if;
  if p_mode = 'report' and coalesce(p_jours, 0) not in (2, 4, 7) then raise exception 'Plus tard : de 2, 4 ou 7 jours.'; end if;
  if length(mot) < 10 then raise exception 'Expliquez en une phrase pourquoi vous demandez ce délai.'; end if;
  perform pg_advisory_xact_lock(hashtext('guichet-delai:' || eid));
  if exists (select 1 from public.registre r where r.collection = 'delais' and r.data->>'entrepriseId' = eid and r.data->>'statut' = 'attente') then
    raise exception 'Une demande de délai attend déjà la réponse de la Direction.';
  end if;
  -- Seulement ses avis émis (décision validée).
  select array_agg(distinct d.id) into ids
    from public.registre d
    join public.registre dec on dec.collection = 'decisions' and dec.id = d.id and dec.data->>'statut' = 'validee'
   where d.collection = 'declarations' and d.id = any(coalesce(p_decls, '{}')) and d.data->>'entrepriseId' = eid;
  if ids is null or cardinality(ids) = 0 then raise exception 'Choisissez au moins un avis à payer.'; end if;
  did := 'dl' || substr(md5(eid || ':' || clock_timestamp()::text || ':' || random()::text), 1, 18);
  insert into public.registre (collection, id, data) values ('delais', did, jsonb_strip_nulls(jsonb_build_object(
    'entrepriseId', eid, 'entrepriseNom', e->>'nom', 'decls', to_jsonb(ids), 'mode', p_mode,
    'nb', case when p_mode = 'plusieurs' then p_nb end, 'jours', case when p_mode = 'report' then p_jours end,
    'motif', mot, 'statut', 'attente', 'enLigne', true, 'at', m)));
  return jsonb_build_object('id', did, 'at', m);
end
$$;
revoke all on function public.demander_delai(text, text[], text, integer, integer, text) from public;
grant execute on function public.demander_delai(text, text[], text, integer, integer, text) to anon, authenticated;

create or replace function public.annuler_delai(p_jeton text, p_id text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  eid text := public.entreprise_du_jeton(p_jeton);
begin
  if eid is null then
    raise exception 'Lien inconnu ou coupé : demandez un nouveau lien à la Préfecture.' using errcode = '28000';
  end if;
  update public.registre
     set data = data || jsonb_build_object('statut', 'annulee', 'annuleLe', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
   where collection = 'delais' and id = p_id and data->>'entrepriseId' = eid and data->>'statut' = 'attente';
  return found;
end
$$;
revoke all on function public.annuler_delai(text, text) from public;
grant execute on function public.annuler_delai(text, text) to anon, authenticated;

create or replace function public.delais_entreprise(p_jeton text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select case when public.entreprise_du_jeton(p_jeton) is null then null else coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id) || (x.data - 'by' - 'decidePar') order by x.data->>'at' desc)
      from (select r.id, r.data from public.registre r
             where r.collection = 'delais' and r.data->>'entrepriseId' = public.entreprise_du_jeton(p_jeton)
             order by r.data->>'at' desc limit 10) x), '[]'::jsonb) end
$$;
revoke all on function public.delais_entreprise(text) from public;
grant execute on function public.delais_entreprise(text) to anon, authenticated;

commit;
