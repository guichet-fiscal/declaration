-- Guichet fiscal : mise à jour 26 (classement des heures de service)
--
-- La pointeuse affiche un classement des heures de service (semaine, semaine dernière, mois, depuis le
-- début), le record de l'équipe et des badges, pour donner envie de prendre son service en ville.
-- Les agents qui n'ont que l'accès « pointeuse » ne lisent que leurs propres pointages (mise à jour 18) :
-- la fonction « classement_service » leur donne les services des 120 derniers jours de tous les agents,
-- avec seulement le nom (celui de la fiche de fonctionnaire), le début, la fin et lequel est le leur.
-- Ni les identifiants Discord, ni les corrections, ni la paye.
--
-- À exécuter après supabase/v18_payes_pointeuse.sql. Il peut être exécuté plusieurs fois.

begin;

create or replace function public.classement_service()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select case when public.mon_role() is null then null else coalesce((
    select jsonb_agg(jsonb_build_object(
        'a', substr(md5('classement:' || coalesce(p.data->>'discordId', p.id)), 1, 12),
        'nom', coalesce(
          (select f.data->>'nom' from public.registre f
            where f.collection = 'fonctionnaires' and f.data->>'discordId' = p.data->>'discordId'
            order by coalesce((f.data->>'actif')::boolean, true) desc limit 1),
          nullif(p.data->>'nom', ''), 'Agent'),
        'moi', coalesce(p.data->>'discordId' = public.mon_discord(), false),
        'debut', p.data->>'debut',
        'fin', p.data->>'fin')
      order by p.data->>'debut')
    from public.registre p
    where p.collection = 'pointages'
      and nullif(p.data->>'annule', 'false') is null
      and p.data->>'debut' is not null
      and (p.data->>'debut')::timestamptz > now() - interval '120 days'), '[]'::jsonb) end
$$;
revoke all on function public.classement_service() from public, anon;
grant execute on function public.classement_service() to authenticated;

commit;
