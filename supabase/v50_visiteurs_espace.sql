-- Guichet fiscal : mise à jour 50 (visiteurs attendus annoncés depuis Mon espace)
--
-- Jusqu'ici, seuls le service de la protection, la Direction, l'Inspection et les RH pouvaient annoncer un
-- visiteur extérieur à l'accueil. Tout fonctionnaire en service peut désormais en annoncer depuis un rendez-vous
-- de son agenda personnel (Mon espace) : l'accueil les voit dans « Visiteurs attendus » (nom, heure, titre du
-- rendez-vous, fonctionnaire visité) et le fonctionnaire est prévenu dans son espace à leur arrivée
-- (annoncer_visiteur, mise à jour 42). L'heure et le titre sont repris du rendez-vous lui-même ; un rendez-vous
-- supprimé ou déplacé met ses visiteurs à jour. 12 visiteurs par rendez-vous, 30 attendus en même temps au plus.
--
-- À exécuter après supabase/v42_signalements_attendus.sql (et v34 pour l'agenda personnel).
-- Il peut être exécuté plusieurs fois.

begin;

create or replace function public.annoncer_attendus_perso(p_ref uuid, p_noms text[])
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_fid  text := public.mon_fonctionnaire();
  v_f    jsonb;
  v_hote text;
  v_ev   record;
  v_noms text[];
  v_n    text;
  v_id   text;
  v_old  jsonb;
  v_cnt  integer := 0;
  v_m    text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_d    text;
begin
  if v_fid is null then
    raise exception 'Votre compte n’est relié à aucune fiche de fonctionnaire en service.' using errcode = '28000';
  end if;
  perform pg_advisory_xact_lock(hashtext('guichet-attendus-perso:' || v_fid));
  select r.data into v_f from public.registre r where r.collection = 'fonctionnaires' and r.id = v_fid;
  v_hote := coalesce(nullif(btrim(v_f->>'nom'), ''), 'Fonctionnaire');
  select a.id, a.titre, a.debut, a.journee into v_ev from public.agenda_perso a where a.id = p_ref and a.fid = v_fid;
  -- Noms nettoyés, sans doublon, 12 au plus ; aucun si le rendez-vous n'existe plus.
  select coalesce(array_agg(x), '{}') into v_noms from (
    select distinct on (lower(x)) x from (select left(regexp_replace(btrim(u), '\s+', ' ', 'g'), 80) as x from unnest(coalesce(p_noms, '{}')) u) t
     where length(x) >= 2 order by lower(x) limit 12) s;
  if v_ev.id is null then v_noms := '{}'; end if;
  if array_length(v_noms, 1) > 0 then
    if v_ev.journee then
      raise exception 'Indiquez l’heure du rendez-vous : l’accueil attend vos visiteurs à une heure précise.';
    end if;
    if v_ev.debut < now() - interval '12 hours' or v_ev.debut > now() + interval '60 days' then
      raise exception 'Les visiteurs ne s’annoncent que pour un rendez-vous des 60 prochains jours.';
    end if;
  end if;
  v_d := to_char(v_ev.debut at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  -- Ceux qui ne sont plus annoncés (ou dont le rendez-vous a disparu) : annulés, sauf s'ils sont déjà arrivés.
  update public.registre
     set data = data || jsonb_build_object('statut', 'annule', 'annuleLe', v_m, 'annulePar', v_hote)
   where collection = 'securiteAttendus' and data->>'agendaPersoId' = p_ref::text and data->>'hoteFid' = v_fid
     and data->>'statut' = 'attendu' and not (lower(data->>'nom') = any (select lower(x) from unnest(v_noms) x));
  foreach v_n in array v_noms loop
    select r.id, r.data into v_id, v_old from public.registre r
     where r.collection = 'securiteAttendus' and r.data->>'agendaPersoId' = p_ref::text and r.data->>'hoteFid' = v_fid
       and lower(r.data->>'nom') = lower(v_n) limit 1;
    if v_id is not null then
      if coalesce(v_old->>'statut', '') = 'arrive' then continue; end if;
      update public.registre set data = data || jsonb_build_object('nom', v_n, 'date', v_d, 'objet', v_ev.titre, 'statut', 'attendu', 'modifieLe', v_m)
       where collection = 'securiteAttendus' and id = v_id;
    else
      if (select count(*) from public.registre r where r.collection = 'securiteAttendus' and r.data->>'hoteFid' = v_fid
            and r.data->>'statut' = 'attendu' and r.data->>'date' > to_char((now() - interval '12 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) >= 30 then
        raise exception 'Trente visiteurs sont déjà attendus pour vous : attendez qu’ils soient passés.';
      end if;
      v_id := 'va' || substr(md5(v_fid || ':' || v_n || ':' || clock_timestamp()::text || random()::text), 1, 18);
      insert into public.registre (collection, id, data) values ('securiteAttendus', v_id, jsonb_build_object(
        'nom', v_n, 'date', v_d, 'hote', v_hote, 'hoteFid', v_fid, 'objet', v_ev.titre, 'agendaPersoId', p_ref::text,
        'statut', 'attendu', 'source', 'espace', 'fid', v_fid, 'agent', v_hote, 'at', v_m));
    end if;
    v_id := null;
    v_cnt := v_cnt + 1;
  end loop;
  return v_cnt;
end
$$;
revoke all on function public.annoncer_attendus_perso(uuid, text[]) from public, anon;
grant execute on function public.annoncer_attendus_perso(uuid, text[]) to authenticated;

-- Ses visiteurs (attendus, arrivés ou annulés depuis 2 jours) : pour son agenda personnel.
create or replace function public.mes_attendus()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'nom', r.data->>'nom', 'date', r.data->>'date', 'statut', r.data->>'statut',
           'arriveLe', r.data->>'arriveLe', 'agendaPersoId', r.data->>'agendaPersoId', 'agendaId', r.data->>'agendaId', 'objet', r.data->>'objet')
           order by r.data->>'date'), '[]'::jsonb)
    from public.registre r
   where r.collection = 'securiteAttendus' and public.mon_fonctionnaire() is not null
     and r.data->>'hoteFid' = public.mon_fonctionnaire()
     and r.data->>'date' > to_char((now() - interval '2 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;
revoke all on function public.mes_attendus() from public, anon;
grant execute on function public.mes_attendus() to authenticated;

commit;
