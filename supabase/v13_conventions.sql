-- Guichet fiscal : mise à jour 13 · Conventions de partenariat
--
-- À exécuter une fois dans Supabase → SQL Editor, après la mise à jour 12.
-- Le script peut être relancé sans risque.
--
-- Les conventions et les prestations offertes sont rangées dans le registre (collections
-- « conventions » et « prestations »). L'Inspection prépare un projet de convention et note les
-- prestations offertes, qui restent « à valider » ; seule la Direction signe, résilie, valide, refuse
-- ou annule. Pour tous, Direction comprise : une convention signée ne se modifie plus et ne se supprime
-- plus ; une prestation traitée garde ses montants, et une prestation validée ne se supprime pas
-- (on l'annule). Les états n'avancent que dans un sens.

-- Une clé absente et une valeur JSON null comptent pour la même chose (déjà créée par la mise à jour 12).
create or replace function public.jn(p jsonb)
returns jsonb
language sql immutable
set search_path = ''
as $$ select coalesce(nullif(p, 'null'::jsonb), 'null'::jsonb) $$;

create or replace function public.verrou_convention()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  o  jsonb := old.data;
  n  jsonb := new.data;
  so text  := coalesce(old.data->>'statut', 'projet');
  sn text  := coalesce(new.data->>'statut', 'projet');
  k  text;
begin
  if tg_op = 'DELETE' then
    if so not in ('projet', 'annulee') then
      raise exception 'Une convention signée ne se supprime pas : résiliez-la.';
    end if;
    return old;
  end if;
  if so not in ('projet', 'annulee') then
    foreach k in array array['entrepriseId', 'objet', 'signataire', 'services', 'avantages', 'debut', 'fin', 'mecenat', 'taux', 'conditions', 'signeLe', 'signeParNom'] loop
      if public.jn(n->k) is distinct from public.jn(o->k) then
        raise exception 'Une convention signée ne se modifie plus : résiliez-la et signez-en une nouvelle.';
      end if;
    end loop;
  end if;
  if so = 'resiliee' and public.jn(n->'resiliation') is distinct from public.jn(o->'resiliation') then
    raise exception 'Une résiliation enregistrée ne se modifie plus.';
  end if;
  if so <> sn and not ((so = 'projet' and sn in ('signee', 'annulee')) or (so = 'signee' and sn = 'resiliee')) then
    raise exception 'Cette convention vient de changer d''état : rouvrez-la pour voir où elle en est.';
  end if;
  return new;
end
$$;
revoke all on function public.verrou_convention() from public, anon, authenticated;
drop trigger if exists registre_convention on public.registre;
create trigger registre_convention
  before update or delete on public.registre
  for each row
  when (old.collection = 'conventions')
  execute function public.verrou_convention();

create or replace function public.verrou_prestation()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  o  jsonb := old.data;
  n  jsonb := new.data;
  so text  := coalesce(old.data->>'statut', 'a_valider');
  sn text  := coalesce(new.data->>'statut', 'a_valider');
  k  text;
begin
  if tg_op = 'DELETE' then
    if so = 'validee' then
      raise exception 'Une prestation validée ne se supprime pas : annulez-la.';
    end if;
    return old;
  end if;
  if so <> 'a_valider' then
    foreach k in array array['conventionId', 'entrepriseId', 'service', 'date', 'valeur', 'paye'] loop
      if public.jn(n->k) is distinct from public.jn(o->k) then
        raise exception 'Une prestation traitée ne se modifie plus.';
      end if;
    end loop;
  end if;
  if so <> sn and not ((so = 'a_valider' and sn in ('validee', 'refusee', 'annulee')) or (so = 'validee' and sn = 'annulee')) then
    raise exception 'Cette prestation vient d''être traitée par un autre agent : rouvrez la convention.';
  end if;
  return new;
end
$$;
revoke all on function public.verrou_prestation() from public, anon, authenticated;
drop trigger if exists registre_prestation on public.registre;
create trigger registre_prestation
  before update or delete on public.registre
  for each row
  when (old.collection = 'prestations')
  execute function public.verrou_prestation();

-- Ce que l'Inspection peut écrire sur une prestation : la noter (« à valider ») ou la retirer tant
-- qu'elle n'est pas traitée, pour une convention signée de la même entreprise, à une date couverte
-- par la convention, avec un prix normal positif et un prix payé compris entre 0 et ce prix.
create or replace function public.prestation_montants_ok(p_data jsonb)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
begin
  return (p_data->>'valeur')::numeric > 0 and (p_data->>'paye')::numeric >= 0 and (p_data->>'paye')::numeric < (p_data->>'valeur')::numeric;
exception when others then
  return false;
end
$$;
create or replace function public.prestation_date_ok(p_date text, c jsonb)
returns boolean
language plpgsql stable
set search_path = ''
as $$
declare t timestamptz;
begin
  t := p_date::timestamptz;
  return t >= coalesce(c->>'debut', c->>'signeLe', c->>'at')::timestamptz
     and (nullif(c->>'fin', '') is null or t < (c->>'fin')::timestamptz + interval '1 day')
     and (c->>'statut' <> 'resiliee' or t <= (c->'resiliation'->>'at')::timestamptz);
exception when others then
  return false;
end
$$;
create or replace function public.prestation_inspection_ok(p_id text, p_data jsonb)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(p_data->>'statut', 'a_valider') in ('a_valider', 'annulee')
     and nullif(p_data->'valideLe', 'null'::jsonb) is null
     and public.prestation_montants_ok(p_data)
     and not exists (select 1 from public.registre r
                     where r.collection = 'prestations' and r.id = p_id and coalesce(r.data->>'statut', 'a_valider') <> 'a_valider')
     and exists (select 1 from public.registre c
                 where c.collection = 'conventions' and c.id = p_data->>'conventionId'
                   and c.data->>'statut' in ('signee', 'resiliee')
                   and (c.data->>'entrepriseId') is not distinct from (p_data->>'entrepriseId')
                   and public.prestation_date_ok(p_data->>'date', c.data))
$$;
revoke all on function public.prestation_montants_ok(jsonb) from public, anon;
grant execute on function public.prestation_montants_ok(jsonb) to authenticated;
revoke all on function public.prestation_date_ok(text, jsonb) from public, anon;
grant execute on function public.prestation_date_ok(text, jsonb) to authenticated;
revoke all on function public.prestation_inspection_ok(text, jsonb) from public, anon;
grant execute on function public.prestation_inspection_ok(text, jsonb) to authenticated;

-- Droits d'écriture : ceux de la mise à jour 12, plus les conventions et les prestations.
create or replace function public.ecriture_permise(p_collection text, p_id text, p_data jsonb)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case public.mon_role()
    when 'direction' then true
    when 'inspecteur' then
      p_collection in ('demandes', 'relances', 'releves')
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

-- Notifications (mise à jour 10) : la base prévient aussi le service d'envoi quand une convention est
-- préparée ou qu'une prestation est notée (à valider). Sans la mise à jour 10, rien n'est fait.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'notif_registre') then
    drop trigger if exists notif_registre on public.registre;
    create trigger notif_registre
      after insert or update on public.registre
      for each row
      when (new.collection in ('declarations', 'decisions', 'penalites', 'demandes', 'prets', 'controles', 'vehicules', 'convocations', 'contrats', 'conventions', 'prestations'))
      execute function public.notif_registre();
  end if;
end
$$;
