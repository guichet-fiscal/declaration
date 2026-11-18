-- Guichet fiscal : mise à jour 52 (« J'ai payé » depuis l'espace entreprise)
--
-- Depuis son espace, le patron annonce un paiement qu'il a fait : les sommes qu'il règle (avis, pénalités,
-- échéances de prêt encore dues), le montant versé, quand, comment (virement, espèces remises à un agent,
-- autre), le lien d'une preuve et un mot (collection « paiementsAnnonces » du registre). Trois paiements
-- annoncés en attente au plus, une seule annonce en attente par somme, cinq par jour ; il peut retirer la
-- sienne tant qu'elle attend. Au guichet, la Direction vérifie : elle encaisse en un clic ou refuse en disant
-- pourquoi ; pendant la vérification, le recouvrement de ces sommes est suspendu (pas de relance).
--
-- À exécuter après supabase/v51_disponibilites.sql. Il peut être exécuté plusieurs fois.

begin;

create or replace function public.annoncer_paiement(p_jeton text, p_items jsonb, p_montant numeric, p_quand text,
                                                    p_moyen text, p_preuve text, p_note text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  eid   text := public.entreprise_du_jeton(p_jeton);
  e     jsonb;
  n     text;
  it    jsonb;
  k     text;
  iid   text;
  v     jsonb;
  dec   jsonb;
  items jsonb := '[]'::jsonb;
  q     timestamptz;
  pv    text := left(btrim(coalesce(p_preuve, '')), 300);
  nt    text := left(btrim(coalesce(p_note, '')), 300);
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
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cochez ce que vous avez payé.';
  end if;
  if jsonb_array_length(p_items) > 10 then raise exception 'Dix sommes au plus par annonce.'; end if;
  if p_montant is null or p_montant <= 0 or p_montant > 1000000000 then raise exception 'Indiquez le montant versé.'; end if;
  begin
    q := p_quand::timestamptz;
  exception when others then
    q := null;
  end;
  if q is null then raise exception 'Indiquez quand vous avez payé.'; end if;
  if q > now() + interval '10 minutes' then raise exception 'La date du paiement est dans le futur.'; end if;
  if q < now() - interval '14 days' then raise exception 'Paiement de plus de 14 jours : contactez la Préfecture.'; end if;
  if coalesce(p_moyen, '') not in ('virement', 'especes', 'autre') then raise exception 'Dites comment vous avez payé.'; end if;
  if pv <> '' and pv !~* '^https?://' then raise exception 'La preuve doit être un lien (https://…).'; end if;
  perform pg_advisory_xact_lock(hashtext('guichet-paiement:' || eid));
  if (select count(*) from public.registre r where r.collection = 'paiementsAnnonces' and r.data->>'entrepriseId' = eid
        and r.data->>'statut' = 'attente') >= 3 then
    raise exception 'Trois paiements annoncés attendent déjà la vérification de la Préfecture.';
  end if;
  if (select count(*) from public.registre r where r.collection = 'paiementsAnnonces' and r.data->>'entrepriseId' = eid
        and r.data->>'at' > hier) >= 5 then
    raise exception 'Au plus cinq annonces de paiement par jour : réessayez demain.';
  end if;
  for it in select x from jsonb_array_elements(p_items) x loop
    k := it->>'kind';
    iid := it->>'id';
    if coalesce(k, '') not in ('decl', 'pen', 'pret') or coalesce(iid, '') = '' then raise exception 'Somme inconnue.'; end if;
    continue when exists (select 1 from jsonb_array_elements(items) y where y->>'kind' = k and y->>'id' = iid);
    if exists (select 1 from public.registre r, jsonb_array_elements(coalesce(r.data->'items', '[]'::jsonb)) y
                where r.collection = 'paiementsAnnonces' and r.data->>'entrepriseId' = eid and r.data->>'statut' = 'attente'
                  and y->>'kind' = k and y->>'id' = iid) then
      raise exception 'Un paiement de cette somme attend déjà la vérification de la Préfecture.';
    end if;
    if k = 'decl' then
      select d.data into v from public.registre d where d.collection = 'declarations' and d.id = iid
         and (d.data->>'entrepriseId' = eid or (coalesce(d.data->>'entrepriseId', '') = '' and lower(btrim(d.data->>'entrepriseNom')) = n));
      select x.data into dec from public.registre x where x.collection = 'decisions' and x.id = iid;
      if v is null or dec is null or dec->>'statut' <> 'validee' then raise exception 'Cet avis n’est plus à payer.'; end if;
    elsif k = 'pen' then
      select x.data into v from public.registre x where x.collection = 'penalites' and x.id = iid
         and (x.data->>'entrepriseId' = eid or (coalesce(x.data->>'entrepriseId', '') = '' and lower(btrim(x.data->>'entrepriseNom')) = n));
      if v is null or coalesce(v->>'statut', '') <> 'due' then raise exception 'Cette pénalité n’est plus à payer.'; end if;
    else
      select x.data into v from public.registre x where x.collection = 'prets' and x.id = iid and x.data->>'entrepriseId' = eid;
      if v is null or not exists (select 1 from jsonb_array_elements(coalesce(v->'echeances', '[]'::jsonb)) y
                                   where coalesce(y->>'payee', 'false') <> 'true') then
        raise exception 'Ce prêt n’a plus d’échéance à payer.';
      end if;
    end if;
    items := items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('kind', k, 'id', iid,
      'ref', left(it->>'ref', 40), 'label', left(it->>'label', 200),
      'montant', case when jsonb_typeof(it->'montant') = 'number' then round((it->>'montant')::numeric) end,
      'plan', case when it->>'plan' = 'true' then true end,
      'idx', case when k = 'pret' and jsonb_typeof(it->'idx') = 'array' then it->'idx' end,
      'avis', case when k = 'pret' then left(it->>'avis', 60) end)));
  end loop;
  rid := 'pa' || substr(md5(eid || ':' || clock_timestamp()::text || ':' || random()::text), 1, 18);
  insert into public.registre (collection, id, data) values ('paiementsAnnonces', rid, jsonb_strip_nulls(jsonb_build_object(
    'entrepriseId', eid, 'entrepriseNom', e->>'nom', 'items', items, 'montant', round(p_montant),
    'quand', to_char(q at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'moyen', p_moyen,
    'preuve', nullif(pv, ''), 'note', nullif(nt, ''), 'statut', 'attente', 'enLigne', true, 'at', m)));
  return jsonb_build_object('id', rid, 'at', m);
end
$$;
revoke all on function public.annoncer_paiement(text, jsonb, numeric, text, text, text, text) from public;
grant execute on function public.annoncer_paiement(text, jsonb, numeric, text, text, text, text) to anon, authenticated;

create or replace function public.retirer_paiement_annonce(p_jeton text, p_id text)
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
     set data = data || jsonb_build_object('statut', 'retire', 'retireLe', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
   where collection = 'paiementsAnnonces' and id = p_id and data->>'entrepriseId' = eid and data->>'statut' = 'attente';
  return found;
end
$$;
revoke all on function public.retirer_paiement_annonce(text, text) from public;
grant execute on function public.retirer_paiement_annonce(text, text) to anon, authenticated;

-- Ses paiements annoncés (les 15 derniers), sans qui les a vérifiés au guichet ni la note interne.
create or replace function public.paiements_annonces_entreprise(p_jeton text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select case when public.entreprise_du_jeton(p_jeton) is null then null else coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id) || (x.data - 'by' - 'decidePar' - 'decideParNom' - 'noteInterne') order by x.data->>'at' desc)
      from (select r.id, r.data from public.registre r
             where r.collection = 'paiementsAnnonces' and r.data->>'entrepriseId' = public.entreprise_du_jeton(p_jeton)
             order by r.data->>'at' desc limit 15) x), '[]'::jsonb) end
$$;
revoke all on function public.paiements_annonces_entreprise(text) from public;
grant execute on function public.paiements_annonces_entreprise(text) to anon, authenticated;

commit;
