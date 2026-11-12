-- Guichet fiscal : mise à jour 45 (tout agent de la protection signale une personne)
--
-- Avec la mise à jour 42, seuls les responsables de la protection (et la Direction) pouvaient signaler
-- une personne. Désormais, tout agent du service de la protection en signale une, et modifie ses propres
-- signalements ; lever un signalement d'un autre et supprimer restent aux responsables et à la Direction
-- (la suppression suit toujours la règle de la mise à jour 42).
--
-- À exécuter après supabase/v44_consultations.sql. Il peut être exécuté plusieurs fois.

begin;

create or replace function public.ecriture_securite(p_collection text, p_data jsonb)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (public.ma_protection() is not null
          and (p_collection in ('securiteEntrees', 'securiteControles', 'securiteAttendus')
               or (p_collection in ('securiteRapports', 'securiteSignalements')
                   and (public.ma_protection() = 'responsable' or p_data->>'fid' = public.mon_fonctionnaire()))))
      or (p_collection = 'securiteAttendus' and coalesce(public.mon_role(), '') in ('inspecteur', 'rh'))
$$;
revoke all on function public.ecriture_securite(text, jsonb) from public, anon;
grant execute on function public.ecriture_securite(text, jsonb) to authenticated;

commit;
