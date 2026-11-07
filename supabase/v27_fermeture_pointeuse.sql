-- Guichet fiscal : mise à jour 27 (fermeture de la pointeuse)
--
-- À partir du lundi 9 novembre 2026 à 0 h (heure de Paris), les heures de service se relèvent sur la
-- tablette en jeu et se saisissent à la main dans la paye. La pointeuse du guichet ferme :
--  1. la fonction « pointer » refuse de prendre ou de finir un service, pour tout le monde ;
--  2. les agents qui n'ont que l'accès « pointeuse » ne lisent plus rien du registre (leurs pointages
--     compris). Leur compte reste dans la liste des accès : la Direction peut le retirer ou lui donner
--     un autre rôle dans Réglages → Accès.
-- La Direction garde tous les pointages et peut encore corriger ceux d'avant la fermeture pour la
-- dernière paye (semaine 45). Un service encore ouvert à la fermeture compte jusqu'au lundi 0 h.
--
-- Le script peut être exécuté avant la date : tout se ferme tout seul à l'heure dite. Il peut être
-- exécuté plusieurs fois. À exécuter après supabase/v18_payes_pointeuse.sql.

begin;

-- 1. Ce que lit chacun : le rôle « pointeuse » ne lit plus rien après la fermeture ------------------------
drop policy if exists "registre lecture" on public.registre;
create policy "registre lecture" on public.registre for select to authenticated using (
  (select public.mon_role()) in ('direction', 'inspecteur', 'lecture')
  or ((select public.mon_role()) = 'pointeuse' and collection = 'pointages'
      and data->>'discordId' = (select public.mon_discord())
      and now() < timestamptz '2026-11-09 00:00:00 Europe/Paris'));

-- 2. La pointeuse refuse toute prise et toute fin de service après la fermeture ---------------------------
create or replace function public.pointer(p_action text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_role    text := public.mon_role();
  v_discord text := public.mon_discord();
  v_nom     text;
  v_now     timestamptz := now();
  v_iso     text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_id      text;
  v_data    jsonb;
  v_open    public.registre%rowtype;
begin
  if v_role is null or v_discord is null then
    raise exception 'Votre compte n''a pas accès au guichet.' using errcode = '42501';
  end if;
  if v_now >= timestamptz '2026-11-09 00:00:00 Europe/Paris' then
    raise exception 'La pointeuse est fermée depuis le lundi 9 novembre à 0 h : les heures de service se relèvent sur la tablette en jeu.' using errcode = 'P0001';
  end if;
  if p_action is null or p_action not in ('debut', 'fin') then
    raise exception 'Action de pointeuse inconnue.' using errcode = 'P0001';
  end if;
  -- Une seule action à la fois pour une même personne (double clic, deux onglets).
  perform pg_advisory_xact_lock(hashtext('guichet-pointage:' || v_discord));
  select a.nom into v_nom from public.agents a where a.discord_id = v_discord;
  select r.* into v_open from public.registre r
   where r.collection = 'pointages' and r.data->>'discordId' = v_discord
     and coalesce(r.data->>'fin', '') = '' and coalesce((r.data->>'annule')::boolean, false) = false
   order by r.data->>'debut' desc
   limit 1;
  if p_action = 'debut' then
    if found then
      raise exception 'Vous êtes déjà en service depuis le %.',
        to_char((v_open.data->>'debut')::timestamptz at time zone 'Europe/Paris', 'DD/MM à HH24:MI') using errcode = 'P0001';
    end if;
    v_id := 'pt' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSMS') || substr(md5(random()::text || v_discord), 1, 6);
    v_data := jsonb_build_object('discordId', v_discord, 'nom', coalesce(v_nom, ''), 'debut', v_iso, 'fin', null,
                                 'source', 'pointeuse', 'at', v_iso);
    insert into public.registre (collection, id, data) values ('pointages', v_id, v_data);
  else
    if not found then
      raise exception 'Vous n''êtes pas en service.' using errcode = 'P0001';
    end if;
    v_id := v_open.id;
    v_data := v_open.data || jsonb_build_object('fin', v_iso, 'finSource', 'pointeuse');
    if v_now - (v_open.data->>'debut')::timestamptz > interval '12 hours' then
      v_data := v_data || jsonb_build_object('aVerifier', true);
    end if;
    update public.registre set data = v_data where collection = 'pointages' and id = v_id;
  end if;
  return jsonb_build_object('id', v_id, 'data', v_data);
end
$$;
revoke all on function public.pointer(text) from public, anon;
grant execute on function public.pointer(text) to authenticated;

commit;
