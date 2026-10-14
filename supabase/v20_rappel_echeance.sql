-- Guichet fiscal : mise à jour 20 (rappel avant la date limite)
--
-- La veille de la date limite de déclaration (le lundi pour une limite le mardi), à 18 h par
-- défaut, la base publie sur Discord un rappel aux entreprises qui n'ont pas encore déclaré la
-- semaine : un seul message, chaque patron mentionné, dans le salon des relances (à défaut, celui
-- des entreprises). Chaque rappel est inscrit au dossier de l'entreprise. Une entreprise déjà
-- rappelée pour cette semaine, à la main ou automatiquement, ne l'est pas une seconde fois.
-- Dans le guichet, Réglages → Recouvrement : activer ou non l'envoi automatique, choisir l'heure.
--
-- Rien ne part si la semaine est clôturée, antérieure au début du suivi, ou si aucun salon n'est
-- réglé. La vérification tourne toutes les heures (tâche « guichet-rappel-echeance »).
--
-- À exécuter après supabase/v19_pointeuse_paye.sql. Il peut être exécuté plusieurs fois.

begin;

create or replace function public.rappel_echeance(p_simulation boolean default false, p_maintenant timestamptz default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  tz constant text := 'Europe/Paris';
  jours constant text[] := array['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
  mois constant text[] := array['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  c jsonb; dsc jsonb;
  t timestamp; delai int; heure int; actif boolean;
  fin timestamp; lim timestamp; moment timestamp; k text;
  hook text; maj numeric; jour_lim text; iso_lim text; iso_now text; tete text; pied text; ligne text;
  e record; uid text;
  noms text[] := '{}'; eids text[] := '{}'; deja text[] := '{}'; lignes text[] := '{}'; ids text[] := '{}';
  part text; part_ids text[]; envois int := 0; i int;
  res jsonb;
begin
  -- Depuis le site (Direction ou Inspection) : seulement l'aperçu, à l'heure réelle.
  -- L'envoi lui-même part de la tâche planifiée, sans compte.
  if auth.uid() is not null then
    if coalesce(public.mon_role(), '') not in ('direction', 'inspecteur') then
      raise exception 'Réservé à la Direction et à l''Inspection.';
    end if;
    p_simulation := true;
    p_maintenant := null;
  end if;

  t := coalesce(p_maintenant, now()) at time zone tz;
  select r.data into c from public.registre r where r.collection = 'config' and r.id = 'main';
  c := coalesce(c, '{}'::jsonb);
  actif := coalesce((c->'rappelEcheance'->>'actif')::boolean, true);
  heure := greatest(0, least(23, coalesce(nullif(c->'rappelEcheance'->>'heure', '')::int, 18)));
  delai := greatest(0, least(6, coalesce(nullif(c->>'delaiJours', '')::int, 2)));
  maj := coalesce(nullif(c->>'majoration', '')::numeric, 10);

  if coalesce(c->>'periodicite', 'semaine') <> 'semaine' then
    return jsonb_build_object('installe', true, 'actif', actif, 'heure', heure, 'raison', 'Déclarations au mois : pas de rappel automatique.');
  end if;

  -- La semaine à rappeler : la dernière terminée tant que sa date limite n'est pas passée,
  -- sinon la semaine en cours. Date limite = dimanche 23 h 59 + le délai de dépôt.
  fin := date_trunc('week', t) - interval '1 microsecond';
  if fin + make_interval(days => delai) < t then fin := fin + interval '7 days'; end if;
  lim := fin + make_interval(days => delai);
  moment := date_trunc('day', lim) - interval '1 day' + make_interval(hours => heure);
  k := to_char(fin, 'IYYY') || '-S' || to_char(fin, 'IW');
  iso_lim := to_char((lim at time zone tz) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  iso_now := to_char(coalesce(p_maintenant, now()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  jour_lim := jours[extract(isodow from lim)::int] || ' ' || extract(day from lim)::int || ' ' || mois[extract(month from lim)::int];

  res := jsonb_build_object('installe', true, 'actif', actif, 'heure', heure, 'periode', k, 'limite', iso_lim,
    'moment', to_char((moment at time zone tz) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));

  if coalesce(c->>'debutSuivi', '') <> '' and c->>'debutSuivi' > k then
    return res || jsonb_build_object('raison', 'Semaine antérieure au début du suivi.');
  end if;
  if exists (select 1 from public.registre r where r.collection = 'clotures' and r.id = k) then
    return res || jsonb_build_object('raison', 'Semaine clôturée.');
  end if;

  -- Entreprises actives attendues cette semaine et sans déclaration (une déclaration rejetée ne compte pas).
  for e in
    select r.id, r.data from public.registre r
    where r.collection = 'entreprises'
      and coalesce((r.data->>'actif')::boolean, true)
      and (coalesce(r.data->>'debutActivite', '') = '' or r.data->>'debutActivite' !~ '^\d{4}-S\d{2}$' or r.data->>'debutActivite' <= k)
      and not exists (
        select 1 from public.registre d
        left join public.registre dc on dc.collection = 'decisions' and dc.id = d.id
        where d.collection = 'declarations' and d.data->>'periode' = k
          and (d.data->>'entrepriseId' = r.id
               or (coalesce(d.data->>'entrepriseId', '') = '' and lower(trim(d.data->>'entrepriseNom')) = lower(trim(r.data->>'nom'))))
          and coalesce(dc.data->>'statut', 'soumise') <> 'rejetee')
    order by lower(r.data->>'nom')
  loop
    if exists (select 1 from public.registre x where x.collection = 'relances' and x.data->>'type' = 'echeance'
               and x.data->>'entrepriseId' = e.id and x.data->'periodes' ? k) then
      deja := deja || (e.data->>'nom');
      continue;
    end if;
    noms := noms || (e.data->>'nom');
    eids := eids || e.id;
    uid := substring(coalesce(e.data->>'discord', '') from '^<@!?(\d{15,21})>$');
    lignes := lignes || ('• **' || (e.data->>'nom') || '** ' || coalesce('<@' || uid || '>', '(sans ping)'));
    ids := ids || coalesce(uid, '');
  end loop;

  res := res || jsonb_build_object('entreprises', to_jsonb(noms), 'deja', to_jsonb(deja),
    'dans_fenetre', t >= moment and t <= lim);

  if p_simulation then return res; end if;
  if not actif then return res || jsonb_build_object('envoye', false, 'raison', 'Envoi automatique désactivé.'); end if;
  if t < moment or t > lim then return res || jsonb_build_object('envoye', false, 'raison', 'Pas encore l''heure du rappel.'); end if;
  if coalesce(array_length(noms, 1), 0) = 0 then return res || jsonb_build_object('envoye', false, 'raison', 'Toutes les entreprises ont déclaré ou ont été rappelées.'); end if;

  select p.valeur into dsc from public.parametres_prives p where p.cle = 'discord';
  hook := coalesce(nullif(dsc->'webhooks'->>'relances', ''), nullif(dsc->'webhooks'->>'entreprises', ''));
  if hook is null then return res || jsonb_build_object('envoye', false, 'raison', 'Aucun salon Discord réglé.'); end if;

  tete := '**Rappel : déclaration de la semaine ' || extract(week from fin)::int || '**' || E'\n'
    || 'La date limite de dépôt est le **' || jour_lim || ' à 23 h 59**. Les entreprises suivantes n’ont pas encore déposé leur déclaration :';
  pied := 'Déposez-la avec le modèle habituel avant la date limite. Après, elle sera majorée de '
    || case when maj = trunc(maj) then trunc(maj)::text else replace(maj::text, '.', ',') end || ' % pour retard.' || E'\n' || '— Préfecture de police · Direction des impôts et cotisations';

  -- Un message de 2 000 caractères au plus : la liste est coupée en plusieurs messages si besoin.
  part := ''; part_ids := '{}';
  for i in 1 .. array_length(lignes, 1) loop
    if part <> '' and length(tete) + length(part) + length(lignes[i]) + length(pied) + 6 > 1900 then
      perform net.http_post(url := hook,
        body := jsonb_build_object('content', tete || E'\n' || part || E'\n\n' || pied, 'username', coalesce(nullif(dsc->>'nom', ''), 'Préfecture de police'),
          'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb, 'users', to_jsonb(array_remove(part_ids, '')))),
        headers := jsonb_build_object('Content-Type', 'application/json'), timeout_milliseconds := 10000);
      envois := envois + 1; part := ''; part_ids := '{}';
    end if;
    part := part || case when part = '' then '' else E'\n' end || lignes[i];
    part_ids := part_ids || ids[i];
  end loop;
  perform net.http_post(url := hook,
    body := jsonb_build_object('content', tete || E'\n' || part || E'\n\n' || pied, 'username', coalesce(nullif(dsc->>'nom', ''), 'Préfecture de police'),
      'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb, 'users', to_jsonb(array_remove(part_ids, '')))),
    headers := jsonb_build_object('Content-Type', 'application/json'), timeout_milliseconds := 10000);
  envois := envois + 1;

  -- Le rappel est inscrit au dossier de chaque entreprise (et au journal).
  for e in
    select r.id, r.data from public.registre r
    where r.collection = 'entreprises' and r.id = any (eids)
  loop
    insert into public.registre (collection, id, data)
    values ('relances', 'ech' || substr(md5(k || ':' || e.id), 1, 17), jsonb_build_object(
      'entrepriseId', e.id, 'entrepriseNom', e.data->>'nom', 'type', 'echeance', 'niveau', 'rappel',
      'periodes', jsonb_build_array(k), 'items', '[]'::jsonb, 'montant', 0, 'echeance', iso_lim, 'at', iso_now,
      'by', null, 'byNom', 'Rappel automatique', 'auto', true, 'groupee', true))
    on conflict (collection, id) do nothing;
  end loop;

  return res || jsonb_build_object('envoye', true, 'messages', envois);
end
$$;
revoke all on function public.rappel_echeance(boolean, timestamptz) from public, anon;
grant execute on function public.rappel_echeance(boolean, timestamptz) to authenticated;

-- Vérification toutes les heures, à la 5e minute : le rappel part à la première vérification
-- après l'heure choisie (18 h 05 par défaut).
select cron.schedule('guichet-rappel-echeance', '5 * * * *', 'select public.rappel_echeance()');

commit;
