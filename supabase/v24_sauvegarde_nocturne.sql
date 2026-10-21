-- Guichet fiscal : mise à jour 24 (sauvegarde nocturne)
--
-- Chaque nuit, la base copie tout le registre (réglages, entreprises, déclarations, avis,
-- paiements, contrôles, relevés, payes…) dans une table privée, que le site ne peut ni modifier
-- ni effacer. Les 30 dernières copies sont gardées (un mois). Une copie fait environ 250 ko.
-- Dans le guichet, Réglages → Sauvegardes : la Direction voit les copies et en télécharge une,
-- au format du bouton « Télécharger une sauvegarde » ; « Restaurer depuis un fichier » la relit.
--
-- Tâche planifiée « guichet-sauvegarde-nocturne » : 2 h UTC, soit 4 h à Paris l'été et 3 h l'hiver.
-- Une première copie est faite tout de suite.
--
-- À exécuter après supabase/v23_conventions_suppression.sql. Il peut être exécuté plusieurs fois.

begin;

create schema if not exists sauvegardes;
revoke all on schema sauvegardes from public, anon, authenticated;

create table if not exists sauvegardes.nocturnes (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  lignes integer not null,
  donnees jsonb not null
);
revoke all on table sauvegardes.nocturnes from public, anon, authenticated;

-- La copie elle-même : seulement par la tâche planifiée (aucun compte du site ne peut l'appeler).
create or replace function public.sauvegarde_nocturne()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare n integer;
begin
  insert into sauvegardes.nocturnes (lignes, donnees)
  select count(*), coalesce(jsonb_agg(jsonb_build_object('collection', r.collection, 'id', r.id, 'data', r.data) order by r.collection, r.id), '[]'::jsonb)
  from public.registre r
  returning lignes into n;
  delete from sauvegardes.nocturnes
  where id not in (select s.id from sauvegardes.nocturnes s order by s.at desc limit 30);
  return n;
end
$$;
revoke all on function public.sauvegarde_nocturne() from public, anon, authenticated;

-- Liste des copies : Direction seulement.
create or replace function public.sauvegardes_nocturnes()
returns table (id bigint, at timestamptz, lignes integer, taille integer)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if coalesce(public.mon_role(), '') <> 'direction' then
    raise exception 'Réservé à la Direction.';
  end if;
  return query select s.id, s.at, s.lignes, pg_column_size(s.donnees)::integer from sauvegardes.nocturnes s order by s.at desc;
end
$$;
revoke all on function public.sauvegardes_nocturnes() from public, anon;
grant execute on function public.sauvegardes_nocturnes() to authenticated;

-- Contenu d'une copie : Direction seulement.
create or replace function public.sauvegarde_nocturne_lire(p_id bigint)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare d jsonb; t timestamptz;
begin
  if coalesce(public.mon_role(), '') <> 'direction' then
    raise exception 'Réservé à la Direction.';
  end if;
  select s.donnees, s.at into d, t from sauvegardes.nocturnes s where s.id = p_id;
  if d is null then raise exception 'Sauvegarde introuvable.'; end if;
  return jsonb_build_object('at', t, 'lignes', d);
end
$$;
revoke all on function public.sauvegarde_nocturne_lire(bigint) from public, anon;
grant execute on function public.sauvegarde_nocturne_lire(bigint) to authenticated;

select cron.schedule('guichet-sauvegarde-nocturne', '0 2 * * *', 'select public.sauvegarde_nocturne()');

select public.sauvegarde_nocturne();

commit;
