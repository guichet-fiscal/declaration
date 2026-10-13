-- Guichet fiscal : mise à jour 19 (la paye sur la pointeuse)
--
-- Chaque agent voit sur sa pointeuse la paye de sa semaine, qui monte en direct pendant son service :
-- heures pointées × taux horaire de son grade, dans la limite des heures et de la paye maximum par
-- semaine. Les agents qui n'ont que l'accès « pointeuse » ne lisent ni les fiches des fonctionnaires
-- ni les réglages (mise à jour 18) : la fonction « ma_paye » leur donne, et à eux seuls, leur propre
-- fiche (nom, grade) et le barème des payes (grades et taux, heures et paye maximum par semaine).
-- Rien d'autre : ni le budget, ni les payes des autres, ni les réglages du guichet.
--
-- À exécuter après supabase/v18_payes_pointeuse.sql. Il peut être exécuté plusieurs fois.

begin;

create or replace function public.ma_paye()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select case when public.mon_role() is null or public.mon_discord() is null then null else jsonb_build_object(
    'fonctionnaire', (
      select jsonb_build_object('nom', f.data->>'nom', 'grade', f.data->>'grade', 'actif', coalesce((f.data->>'actif')::boolean, true))
      from public.registre f
      where f.collection = 'fonctionnaires' and f.data->>'discordId' = public.mon_discord()
      order by coalesce((f.data->>'actif')::boolean, true) desc, f.data->>'at' desc
      limit 1),
    'bareme', (
      select jsonb_strip_nulls(jsonb_build_object('grades', c.data->'payes'->'grades', 'plafondHeures', c.data->'payes'->'plafondHeures', 'payeMax', c.data->'payes'->'payeMax'))
      from public.registre c
      where c.collection = 'config' and c.id = 'main'))
  end
$$;
revoke all on function public.ma_paye() from public, anon;
grant execute on function public.ma_paye() to authenticated;

commit;
