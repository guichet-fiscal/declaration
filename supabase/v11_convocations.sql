-- Guichet fiscal : mise à jour 11 · Convocations et collecte des impôts
--
-- À exécuter une fois dans Supabase → SQL Editor, après la mise à jour 10.
-- Le script peut être relancé sans risque.
--
-- Les convocations sont rangées dans le registre (collection « convocations »). L'Inspection peut
-- convoquer une entreprise, constater sa présence ou son absence, annuler ou reporter le rendez-vous.
-- Seule la Direction encaisse une collecte et sanctionne une absence (ou en dispense). Une fois une
-- convocation traitée (présence, absence, annulation), son état ne change plus, pour personne :
-- la Direction corrige une erreur en la supprimant puis en convoquant de nouveau.
-- Supprimer une convocation reste réservé à la Direction, comme pour tout le registre.

-- Ce que l'Inspection peut écrire sur une convocation, comparé à ce qui est enregistré :
-- ni sanction, ni encaissement ; les sommes et les taux annoncés restent ceux de la convocation ;
-- une nouvelle convocation reprend les taux des réglages.
create or replace function public.convocation_inspection_ok(p_id text, p_data jsonb)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  with avant as (
    select (select r.data from public.registre r where r.collection = 'convocations' and r.id = p_id) as d,
           coalesce((select r.data from public.registre r where r.collection = 'config' and r.id = 'main'), '{}'::jsonb) as c
  )
  select coalesce(p_data->>'statut', 'convoquee') in ('convoquee', 'honoree', 'absente', 'annulee')
     and nullif(p_data->'sanction', 'null'::jsonb) is not distinct from nullif(avant.d->'sanction', 'null'::jsonb)
     and nullif(p_data->'collecte', 'null'::jsonb) is not distinct from nullif(avant.d->'collecte', 'null'::jsonb)
     and case when avant.d is null then
           coalesce((p_data->>'majPct')::numeric, -1) = coalesce((avant.c->>'convMajoration')::numeric, 10)
           and coalesce((p_data->>'amende')::numeric, -1) = coalesce((avant.c->>'convAmende')::numeric, 5000)
         else
           (p_data->'items') is not distinct from (avant.d->'items')
           and (p_data->'montant') is not distinct from (avant.d->'montant')
           and (p_data->'majPct') is not distinct from (avant.d->'majPct')
           and (p_data->'amende') is not distinct from (avant.d->'amende')
         end
  from avant
$$;
revoke all on function public.convocation_inspection_ok(text, jsonb) from public, anon;
grant execute on function public.convocation_inspection_ok(text, jsonb) to authenticated;

-- Pour tous les agents, Direction comprise : une convocation ne quitte « convoquée » qu'une fois,
-- une sanction décidée ne change plus, et une collecte ne s'encaisse qu'une fois. L'encaissement
-- est d'abord réservé (« en cours », avec un jeton) : seul celui qui l'a réservé le termine.
-- Deux agents qui agissent en même temps : le second est arrêté au lieu d'écraser le premier.
create or replace function public.verrou_convocation()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  o jsonb := old.data;
  n jsonb := new.data;
begin
  if coalesce(o->>'statut', 'convoquee') <> 'convoquee' and (n->>'statut') is distinct from (o->>'statut') then
    raise exception 'Cette convocation vient d''être traitée par un autre agent : rouvrez-la pour voir son état.';
  end if;
  if nullif(o->'sanction', 'null'::jsonb) is not null and (n->'sanction') is distinct from (o->'sanction') then
    raise exception 'La sanction de cette absence est déjà décidée.';
  end if;
  if nullif(o->'collecte', 'null'::jsonb) is not null and (n->'collecte') is distinct from (o->'collecte')
     and not (coalesce((o->'collecte'->>'enCours')::boolean, false)
              and (nullif(n->'collecte', 'null'::jsonb) is null
                   or (n->'collecte'->>'jeton') is not distinct from (o->'collecte'->>'jeton'))) then
    raise exception 'Cette collecte est déjà encaissée, ou un autre agent est en train de l''encaisser.';
  end if;
  return new;
end
$$;
revoke all on function public.verrou_convocation() from public, anon, authenticated;
drop trigger if exists registre_convocation on public.registre;
create trigger registre_convocation
  before update on public.registre
  for each row
  when (old.collection = 'convocations')
  execute function public.verrou_convocation();

-- Droits d'écriture : ceux de la mise à jour 9, plus les convocations.
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

-- Notifications (mise à jour 10) : la base prévient aussi le service d'envoi quand une convocation
-- change (absence à sanctionner, collecte à encaisser). Sans la mise à jour 10, rien n'est fait.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'notif_registre') then
    drop trigger if exists notif_registre on public.registre;
    create trigger notif_registre
      after insert or update on public.registre
      for each row
      when (new.collection in ('declarations', 'decisions', 'penalites', 'demandes', 'prets', 'controles', 'vehicules', 'convocations'))
      execute function public.notif_registre();
  end if;
end
$$;
