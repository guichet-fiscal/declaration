-- Guichet fiscal : mise à jour 21 (espace entreprise)
--
-- Chaque entreprise peut recevoir un lien personnel, sans compte ni connexion : son patron y voit
-- ses déclarations et leurs avis, ce qu'elle doit, ses dates limites et ses relances, et il y dépose
-- lui-même ses déclarations. Une déclaration déposée en ligne arrive dans le guichet, rubrique
-- « Saisir une déclaration », carte « Reçues en ligne » : un agent l'enregistre (le calcul est celui
-- du guichet) ou la refuse avec un motif. La saisie depuis le message Discord reste possible.
--
-- Le lien porte un jeton aléatoire de 36 caractères ; il ne donne accès qu'à cette entreprise, et la
-- Direction peut en créer un nouveau (l'ancien ne marche plus) ou couper l'accès. Les fonctions
-- ci-dessous sont les seules portes : la base ne laisse lire ni écrire le registre sans compte.
--
-- À exécuter après supabase/v20_rappel_echeance.sql. Il peut être exécuté plusieurs fois.

begin;

-- 1. Liens : un par entreprise, lus par la Direction seulement ------------------------------------
create table if not exists public.liens_entreprises (
  entreprise_id   text primary key,
  jeton           text not null unique,
  cree_le         timestamptz not null default now(),
  cree_par        text,
  derniere_visite timestamptz
);
alter table public.liens_entreprises enable row level security;
revoke all on public.liens_entreprises from anon, authenticated;
grant select on public.liens_entreprises to authenticated;
drop policy if exists "liens lecture" on public.liens_entreprises;
create policy "liens lecture" on public.liens_entreprises for select to authenticated
  using ((select public.mon_role()) = 'direction');

-- 2. Créer, renouveler ou couper un lien (Direction) -------------------------------------------------
create or replace function public.lien_entreprise(p_entreprise text, p_action text default 'creer')
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  j text; v_nom text; v_discord text;
begin
  if coalesce(public.mon_role(), '') <> 'direction' then
    raise exception 'Réservé à la Direction.';
  end if;
  if not exists (select 1 from public.registre r where r.collection = 'entreprises' and r.id = p_entreprise) then
    raise exception 'Entreprise introuvable.';
  end if;
  if p_action = 'couper' then
    delete from public.liens_entreprises where entreprise_id = p_entreprise;
    return jsonb_build_object('jeton', null);
  end if;
  select * into v_discord, v_nom from public.journal_auteur();
  j := substr(encode(extensions.gen_random_bytes(18), 'hex'), 1, 36);
  insert into public.liens_entreprises (entreprise_id, jeton, cree_le, cree_par, derniere_visite)
  values (p_entreprise, j, now(), v_nom, null)
  on conflict (entreprise_id) do update
    set jeton = excluded.jeton, cree_le = excluded.cree_le, cree_par = excluded.cree_par, derniere_visite = null;
  return jsonb_build_object('jeton', j, 'cree_le', now(), 'cree_par', v_nom);
end
$$;
revoke all on function public.lien_entreprise(text, text) from public, anon;
grant execute on function public.lien_entreprise(text, text) to authenticated;

-- Entreprise d'un jeton (null si le lien n'existe pas ou plus).
create or replace function public.entreprise_du_jeton(p_jeton text)
returns text
language sql stable security definer
set search_path = ''
as $$
  select l.entreprise_id from public.liens_entreprises l
  where p_jeton ~ '^[0-9a-f]{36}$' and l.jeton = p_jeton
$$;
revoke all on function public.entreprise_du_jeton(text) from public, anon, authenticated;

-- 3. Ce que voit le patron : son entreprise et rien d'autre ---------------------------------------------
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
    'clotures', coalesce((select jsonb_agg(x.id) from public.registre x where x.collection = 'clotures'), '[]'::jsonb)
  );
end
$$;
revoke all on function public.espace_entreprise(text) from public;
grant execute on function public.espace_entreprise(text) to anon, authenticated;

-- 4. Dépôt d'une déclaration par le patron ------------------------------------------------------------
-- Les montants bruts seulement : l'agent qui l'enregistre refait le calcul avec le barème du guichet.
create or replace function public.deposer_declaration(p_jeton text, p_depot jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  tz constant text := 'Europe/Paris';
  eid text; e jsonb; c jsonb; n text; k text; kc text; did text; ancien jsonb;
  ca numeric; ch numeric; ms numeric; nb numeric; solde numeric; cap text; decl text; note text;
  sal jsonb := null; x record; recu text; maintenant text;
begin
  eid := public.entreprise_du_jeton(p_jeton);
  if eid is null then raise exception 'Lien inconnu ou coupé : demandez un nouveau lien à la Préfecture.'; end if;
  select r.data into e from public.registre r where r.collection = 'entreprises' and r.id = eid;
  if e is null then raise exception 'Entreprise introuvable.'; end if;
  if coalesce((e->>'actif')::boolean, true) is not true then raise exception 'Entreprise fermée au registre : elle ne peut plus déposer de déclaration.'; end if;
  if jsonb_typeof(p_depot) <> 'object' or length(p_depot::text) > 20000 then raise exception 'Déclaration illisible.'; end if;
  n := lower(trim(e->>'nom'));
  select r.data into c from public.registre r where r.collection = 'config' and r.id = 'main';
  c := coalesce(c, '{}'::jsonb);

  -- Période : déjà commencée, suivie, pas avant le début d'activité, ni clôturée, ni déjà déclarée.
  k := p_depot->>'periode';
  if coalesce(c->>'periodicite', 'semaine') = 'mois' then
    if k is null or k !~ '^\d{4}-\d{2}$' then raise exception 'Période inconnue.'; end if;
    kc := to_char(now() at time zone tz, 'YYYY-MM');
  else
    if k is null or k !~ '^\d{4}-S\d{2}$' then raise exception 'Période inconnue.'; end if;
    kc := to_char(now() at time zone tz, 'IYYY') || '-S' || to_char(now() at time zone tz, 'IW');
  end if;
  if k > kc then raise exception 'Cette période n’a pas encore commencé.'; end if;
  if coalesce(c->>'debutSuivi', '') <> '' and k < c->>'debutSuivi' then raise exception 'Période antérieure au début du suivi.'; end if;
  if coalesce(e->>'debutActivite', '') ~ '^\d{4}-(S\d{2}|\d{2})$' and k < e->>'debutActivite' then raise exception 'Période antérieure au début de votre activité.'; end if;
  if exists (select 1 from public.registre r where r.collection = 'clotures' and r.id = k) then
    raise exception 'Période clôturée : contactez la Préfecture.';
  end if;
  if exists (select 1 from public.registre d left join public.registre dc on dc.collection = 'decisions' and dc.id = d.id
             where d.collection = 'declarations' and d.data->>'periode' = k
               and (d.data->>'entrepriseId' = eid or (coalesce(d.data->>'entrepriseId', '') = '' and lower(trim(d.data->>'entrepriseNom')) = n))
               and coalesce(dc.data->>'statut', 'soumise') <> 'rejetee') then
    raise exception 'Cette période est déjà déclarée. Pour la corriger, contactez la Préfecture.';
  end if;

  -- Montants : des nombres entiers positifs, dans des limites raisonnables.
  for x in select * from jsonb_each(jsonb_build_object('ca', p_depot->'ca', 'charges', p_depot->'charges', 'masse', p_depot->'masse', 'nbSalaries', p_depot->'nbSalaries')) loop
    if jsonb_typeof(x.value) <> 'number' or (x.value::text)::numeric < 0 or (x.value::text)::numeric > 1000000000000 then
      raise exception 'Montant invalide : %.', case x.key when 'ca' then 'chiffre d’affaires' when 'charges' then 'charges' when 'masse' then 'masse salariale' else 'nombre de salariés' end;
    end if;
  end loop;
  ca := round((p_depot->>'ca')::numeric); ch := round((p_depot->>'charges')::numeric);
  ms := round((p_depot->>'masse')::numeric); nb := round((p_depot->>'nbSalaries')::numeric);
  if nb > 500 then raise exception 'Nombre de salariés invalide.'; end if;
  if jsonb_typeof(p_depot->'salaries') = 'array' then
    if jsonb_array_length(p_depot->'salaries') > 100 then raise exception 'Trop de salariés (100 au plus).'; end if;
    sal := '[]'::jsonb;
    for x in select * from jsonb_array_elements(p_depot->'salaries') loop
      if jsonb_typeof(x.value->'salaire') <> 'number' or (x.value->>'salaire')::numeric < 0 or (x.value->>'salaire')::numeric > 10000000000 then
        raise exception 'Salaire invalide.';
      end if;
      sal := sal || jsonb_build_array(jsonb_build_object('nom', left(trim(coalesce(x.value->>'nom', '')), 80), 'salaire', round((x.value->>'salaire')::numeric)));
    end loop;
  end if;
  if jsonb_typeof(p_depot->'solde') = 'number' then
    solde := round((p_depot->>'solde')::numeric);
    if abs(solde) > 1000000000000 then raise exception 'Solde invalide.'; end if;
  elsif coalesce(p_depot->>'solde', '') <> '' then raise exception 'Solde invalide.';
  end if;
  cap := nullif(trim(coalesce(p_depot->>'capture', '')), '');
  if cap is not null and (cap !~ '^https://\S+$' or length(cap) > 500) then raise exception 'Lien de la capture invalide : il doit commencer par https://'; end if;
  decl := left(trim(coalesce(p_depot->>'declarant', '')), 80);
  if decl = '' then raise exception 'Indiquez le nom du déclarant.'; end if;
  note := left(trim(coalesce(p_depot->>'note', '')), 1000);

  -- Au plus 20 envois par heure et par entreprise.
  if (select count(*) from public.journal j where j.collection = 'depots' and j.at > now() - interval '1 hour' and j.apres->>'entrepriseId' = eid) >= 20 then
    raise exception 'Trop d’envois : réessayez dans une heure.';
  end if;

  did := 'dep' || substr(md5(eid || ':' || k), 1, 17);
  select r.data into ancien from public.registre r where r.collection = 'depots' and r.id = did;
  maintenant := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  -- Une correction avant l'enregistrement garde l'heure du premier envoi (celle qui compte pour le retard).
  recu := case when ancien is not null and ancien->>'statut' = 'recu' then ancien->>'recuLe' else maintenant end;
  insert into public.registre (collection, id, data)
  values ('depots', did, jsonb_strip_nulls(jsonb_build_object(
    'entrepriseId', eid, 'entrepriseNom', e->>'nom', 'periode', k, 'ca', ca, 'charges', ch, 'masse', ms, 'nbSalaries', nb,
    'salaries', sal, 'solde', solde, 'capture', cap, 'declarant', decl, 'note', nullif(note, ''),
    'statut', 'recu', 'enLigne', true, 'recuLe', recu,
    'modifieLe', case when ancien is not null then maintenant end,
    'envois', coalesce((ancien->>'envois')::int, 0) + 1)))
  on conflict (collection, id) do update set data = excluded.data;
  return jsonb_build_object('id', did, 'recuLe', recu, 'periode', k);
end
$$;
revoke all on function public.deposer_declaration(text, jsonb) from public;
grant execute on function public.deposer_declaration(text, jsonb) to anon, authenticated;

-- 5. L'Inspection enregistre ou refuse les déclarations reçues en ligne ----------------------------
-- Droits d'écriture : ceux de la mise à jour 14, plus les dépôts en ligne.
create or replace function public.ecriture_permise(p_collection text, p_id text, p_data jsonb)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case public.mon_role()
    when 'direction' then true
    when 'inspecteur' then
      p_collection in ('demandes', 'relances', 'releves', 'depots')
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
