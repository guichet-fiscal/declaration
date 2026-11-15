-- Guichet fiscal : mise à jour 49 (réclamations depuis l'espace entreprise)
--
-- Depuis son espace, le patron conteste un avis émis pas encore payé ou une pénalité à payer : il explique
-- pourquoi (20 caractères au moins), peut joindre le lien d'une preuve et proposer le montant qu'il estime
-- juste (collection « reclamations » du registre). Trois réclamations en attente au plus, une seule par
-- dossier, cinq par jour ; il peut retirer la sienne tant qu'elle attend. Au guichet, la Direction maintient,
-- réduit ou annule ; pendant la réclamation, le recouvrement de ce dossier est suspendu (pas de relance).
--
-- À exécuter après supabase/v46_lettres_delais.sql. Il peut être exécuté plusieurs fois.

begin;

create or replace function public.reclamer(p_jeton text, p_kind text, p_id text, p_motif text, p_preuve text, p_montant numeric)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  eid   text := public.entreprise_du_jeton(p_jeton);
  e     jsonb;
  n     text;
  v     jsonb;
  dec   jsonb;
  mt    numeric;
  cible jsonb;
  mot   text := left(btrim(coalesce(p_motif, '')), 800);
  pv    text := left(btrim(coalesce(p_preuve, '')), 300);
  rid   text;
  m     text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  hier  text := to_char((now() - interval '1 day') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if eid is null then
    raise exception 'Lien inconnu ou coupé : demandez un nouveau lien à la Préfecture.' using errcode = '28000';
  end if;
  select r.data into e from public.registre r where r.collection = 'entreprises' and r.id = eid;
  if e is null then raise exception 'Entreprise introuvable.'; end if;
  n := lower(btrim(coalesce(e->>'nom', '')));
  if coalesce(p_kind, '') not in ('decl', 'pen') then raise exception 'Choisissez l’avis ou la pénalité à contester.'; end if;
  if length(mot) < 20 then raise exception 'Expliquez pourquoi vous contestez (20 caractères au moins).'; end if;
  if pv <> '' and pv !~* '^https?://' then raise exception 'La preuve doit être un lien (https://…).'; end if;
  if p_montant is not null and p_montant < 0 then raise exception 'Le montant proposé ne peut pas être négatif.'; end if;
  perform pg_advisory_xact_lock(hashtext('guichet-reclamation:' || eid));
  if (select count(*) from public.registre r where r.collection = 'reclamations' and r.data->>'entrepriseId' = eid and r.data->>'statut' = 'attente') >= 3 then
    raise exception 'Trois réclamations attendent déjà la réponse de la Direction.';
  end if;
  if (select count(*) from public.registre r where r.collection = 'reclamations' and r.data->>'entrepriseId' = eid and r.data->>'at' > hier) >= 5 then
    raise exception 'Au plus cinq réclamations par jour : réessayez demain.';
  end if;
  if exists (select 1 from public.registre r where r.collection = 'reclamations' and r.data->>'entrepriseId' = eid
              and r.data->>'statut' = 'attente' and r.data->'cible'->>'id' = p_id) then
    raise exception 'Une réclamation sur ce dossier attend déjà la réponse de la Direction.';
  end if;
  if p_kind = 'decl' then
    select d.data into v from public.registre d where d.collection = 'declarations' and d.id = p_id
       and (d.data->>'entrepriseId' = eid or (coalesce(d.data->>'entrepriseId', '') = '' and lower(btrim(d.data->>'entrepriseNom')) = n));
    select x.data into dec from public.registre x where x.collection = 'decisions' and x.id = p_id;
    if v is null or dec is null or dec->>'statut' <> 'validee' then
      raise exception 'Seul un avis émis et pas encore payé peut être contesté.';
    end if;
    if exists (select 1 from public.registre x where x.collection = 'echeanciers' and x.id = p_id) then
      raise exception 'Cet avis se paie en plusieurs fois : contactez la Préfecture pour le contester.';
    end if;
    mt := coalesce((dec->>'montant')::numeric, (v->>'total')::numeric, 0);
    cible := jsonb_build_object('kind', 'decl', 'id', p_id, 'periode', v->>'periode', 'montant', mt);
  else
    select x.data into v from public.registre x where x.collection = 'penalites' and x.id = p_id
       and (x.data->>'entrepriseId' = eid or (coalesce(x.data->>'entrepriseId', '') = '' and lower(btrim(x.data->>'entrepriseNom')) = n));
    if v is null or coalesce(v->>'statut', '') <> 'due' then
      raise exception 'Seule une pénalité encore à payer peut être contestée.';
    end if;
    mt := coalesce((v->>'montant')::numeric, 0);
    cible := jsonb_strip_nulls(jsonb_build_object('kind', 'pen', 'id', p_id, 'type', v->>'type', 'motif', left(v->>'motif', 200), 'montant', mt));
  end if;
  if p_montant is not null and p_montant >= mt then
    raise exception 'Le montant que vous proposez doit être inférieur à celui du dossier.';
  end if;
  rid := 'rc' || substr(md5(eid || ':' || clock_timestamp()::text || ':' || random()::text), 1, 18);
  insert into public.registre (collection, id, data) values ('reclamations', rid, jsonb_strip_nulls(jsonb_build_object(
    'entrepriseId', eid, 'entrepriseNom', e->>'nom', 'cible', cible, 'motif', mot, 'preuve', nullif(pv, ''),
    'montantPropose', case when p_montant is not null then round(p_montant) end,
    'statut', 'attente', 'enLigne', true, 'at', m)));
  return jsonb_build_object('id', rid, 'at', m);
end
$$;
revoke all on function public.reclamer(text, text, text, text, text, numeric) from public;
grant execute on function public.reclamer(text, text, text, text, text, numeric) to anon, authenticated;

create or replace function public.retirer_reclamation(p_jeton text, p_id text)
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
     set data = data || jsonb_build_object('statut', 'retiree', 'retireeLe', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
   where collection = 'reclamations' and id = p_id and data->>'entrepriseId' = eid and data->>'statut' = 'attente';
  return found;
end
$$;
revoke all on function public.retirer_reclamation(text, text) from public;
grant execute on function public.retirer_reclamation(text, text) to anon, authenticated;

-- Ses réclamations (les 15 dernières), sans qui les a décidées au guichet.
create or replace function public.reclamations_entreprise(p_jeton text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select case when public.entreprise_du_jeton(p_jeton) is null then null else coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id) || (x.data - 'by' - 'decidePar' - 'decideParNom' - 'note') order by x.data->>'at' desc)
      from (select r.id, r.data from public.registre r
             where r.collection = 'reclamations' and r.data->>'entrepriseId' = public.entreprise_du_jeton(p_jeton)
             order by r.data->>'at' desc limit 15) x), '[]'::jsonb) end
$$;
revoke all on function public.reclamations_entreprise(text) from public;
grant execute on function public.reclamations_entreprise(text) to anon, authenticated;

commit;
