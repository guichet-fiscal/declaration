-- Guichet fiscal : mise à jour 40 (demandes des services réservés à la Direction)
--
-- Les demandes de moyens du FIPN et du GIGN (services « réservés ») ne sont visibles que par la
-- Direction : ni l'Inspection, ni la Lecture seule, ni les RH ne les lisent, ne les saisissent ou ne les
-- modifient, pas plus que leurs décisions (arbitrages) et les contrats d'achat passés pour ces services.
-- Rien ne part sur Discord ni en notification ; l'export vers Google Sheets les laisse de côté ; les
-- lignes du journal qui les concernent ne sont lues que par la Direction. La sauvegarde de la nuit,
-- réservée à la Direction, les garde.
--
-- La liste est dans les réglages (config/main, « servicesReserves ») : Réglages → Services publics,
-- case « Réservé à la Direction ». Ce script la remplit avec FIPN et GIGN si elle n'existe pas encore.
--
-- À exécuter après supabase/v39_securite_rh.sql. Il peut être exécuté plusieurs fois.

begin;

-- 1. La liste des services réservés ------------------------------------------------------------------
update public.registre
   set data = jsonb_set(data, '{servicesReserves}', '["FIPN", "GIGN"]'::jsonb, true)
 where collection = 'config' and id = 'main' and not (data ? 'servicesReserves');

create or replace function public.service_reserve(p_service text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(btrim(p_service), '') <> '' and exists (
    select 1
    from public.registre c, jsonb_array_elements_text(case when jsonb_typeof(c.data->'servicesReserves') = 'array' then c.data->'servicesReserves' else '[]'::jsonb end) s
    where c.collection = 'config' and c.id = 'main' and lower(btrim(s)) = lower(btrim(p_service)))
$$;
revoke all on function public.service_reserve(text) from public, anon;
grant execute on function public.service_reserve(text) to authenticated;

-- Un dossier du registre est réservé : demande d'un service réservé, sa décision (même identifiant),
-- contrat d'achat dont l'acheteur est un service réservé.
create or replace function public.dossier_reserve(p_collection text, p_id text, p_data jsonb)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(case p_collection
    when 'demandes' then public.service_reserve(p_data->>'service')
    when 'arbitrages' then exists (select 1 from public.registre d where d.collection = 'demandes' and d.id = p_id and public.service_reserve(d.data->>'service'))
    when 'contrats' then coalesce(p_data->'acheteur'->>'type', '') = 'service' and public.service_reserve(p_data->'acheteur'->>'service')
    else false
  end, false)
$$;
revoke all on function public.dossier_reserve(text, text, jsonb) from public, anon;
grant execute on function public.dossier_reserve(text, text, jsonb) to authenticated;

-- 2. Registre : règles restrictives (elles s'ajoutent aux autres, qui ne changent pas) ------------------
-- Hors Direction, un dossier réservé n'est ni lu, ni ajouté, ni modifié, ni supprimé.
drop policy if exists "registre reserve lecture" on public.registre;
drop policy if exists "registre reserve ajout" on public.registre;
drop policy if exists "registre reserve modification" on public.registre;
drop policy if exists "registre reserve suppression" on public.registre;
create policy "registre reserve lecture" on public.registre as restrictive for select to authenticated
  using (collection not in ('demandes', 'arbitrages', 'contrats') or (select public.mon_role()) = 'direction' or not public.dossier_reserve(collection, id, data));
create policy "registre reserve ajout" on public.registre as restrictive for insert to authenticated
  with check (collection not in ('demandes', 'arbitrages', 'contrats') or (select public.mon_role()) = 'direction' or not public.dossier_reserve(collection, id, data));
create policy "registre reserve modification" on public.registre as restrictive for update to authenticated
  using (collection not in ('demandes', 'arbitrages', 'contrats') or (select public.mon_role()) = 'direction' or not public.dossier_reserve(collection, id, data))
  with check (collection not in ('demandes', 'arbitrages', 'contrats') or (select public.mon_role()) = 'direction' or not public.dossier_reserve(collection, id, data));
create policy "registre reserve suppression" on public.registre as restrictive for delete to authenticated
  using (collection not in ('demandes', 'arbitrages', 'contrats') or (select public.mon_role()) = 'direction' or not public.dossier_reserve(collection, id, data));

-- 3. Journal : les lignes d'un dossier réservé, pour la Direction seulement ----------------------------
-- Décision dont la demande a depuis été effacée : retrouvée dans le journal de la demande.
create index if not exists journal_collection_doc on public.journal (collection, doc_id);
create or replace function public.journal_reserve(p_collection text, p_doc text, p_avant jsonb, p_apres jsonb)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(case p_collection
    when 'demandes' then public.service_reserve(p_apres->>'service') or public.service_reserve(p_avant->>'service')
    when 'contrats' then public.service_reserve(p_apres->'acheteur'->>'service') or public.service_reserve(p_avant->'acheteur'->>'service')
    when 'arbitrages' then public.dossier_reserve('arbitrages', p_doc, null)
      or exists (select 1 from public.journal j where j.collection = 'demandes' and j.doc_id = p_doc
                 and (public.service_reserve(j.apres->>'service') or public.service_reserve(j.avant->>'service')))
    else false
  end, false)
$$;
revoke all on function public.journal_reserve(text, text, jsonb, jsonb) from public, anon;
grant execute on function public.journal_reserve(text, text, jsonb, jsonb) to authenticated;

drop policy if exists "journal reserve" on public.journal;
create policy "journal reserve" on public.journal as restrictive for select to authenticated
  using (collection not in ('demandes', 'arbitrages', 'contrats') or (select public.mon_role()) = 'direction' or not public.journal_reserve(collection, doc_id, avant, apres));

-- 4. Notifications : rien pour un dossier réservé (le reste comme avant) --------------------------------
create or replace function public.notif_registre()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.notif_config;
begin
  if new.collection in ('demandes', 'arbitrages', 'contrats') and public.dossier_reserve(new.collection, new.id, new.data) then
    return null;
  end if;
  select * into c from public.notif_config where id = 1;
  if c.url is null then return null; end if;
  perform net.http_post(
    url := c.url,
    body := jsonb_build_object(
      'collection', new.collection, 'id', new.id, 'action', tg_op,
      'avant', case when tg_op = 'UPDATE' then old.data end, 'apres', new.data,
      'auteur', new.updated_by),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-guichet-cle', c.secret),
    timeout_milliseconds := 5000);
  return null;
exception when others then
  -- Une notification qui ne part pas ne doit jamais empêcher un enregistrement.
  return null;
end
$$;

-- 5. Export vers Google Sheets : sans les dossiers réservés ni leurs lignes du journal ------------------
create or replace function public.export_registre(p_cle text)
returns json
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id  bigint;
  v_res json;
begin
  select c.id into v_id
  from public.cles_export c
  where c.empreinte = encode(sha256(convert_to(coalesce(p_cle, ''), 'UTF8')), 'hex');
  if v_id is null then
    raise exception 'Clé d''export invalide' using errcode = '28000';
  end if;
  update public.cles_export set derniere_utilisation = now() where id = v_id;
  select json_build_object(
    'genere_le', now(),
    'registre', coalesce((
      select json_agg(json_build_object('collection', r.collection, 'id', r.id, 'data', r.data, 'modifie_le', r.updated_at))
      from public.registre r
      where not (r.collection in ('demandes', 'arbitrages', 'contrats') and public.dossier_reserve(r.collection, r.id, r.data))), '[]'::json),
    'journal', coalesce((
      select json_agg(j)
      from (select x.at, x.auteur, x.action, x.collection, x.doc_id, x.avant, x.apres
            from public.journal x
            where not (x.collection in ('demandes', 'arbitrages', 'contrats') and public.journal_reserve(x.collection, x.doc_id, x.avant, x.apres))
            order by x.at desc limit 3000) j), '[]'::json)
  ) into v_res;
  return v_res;
end
$$;
revoke all on function public.export_registre(text) from public;
grant execute on function public.export_registre(text) to anon, authenticated;

commit;
