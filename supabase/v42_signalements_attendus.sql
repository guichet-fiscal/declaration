-- Guichet fiscal : mise à jour 42 (sécurité : personnes signalées et visiteurs attendus)
--
-- 1. Personnes signalées (collection securiteSignalements) : interdit d'entrée, personne recherchée, à
--    accompagner, à surveiller. Les responsables de la protection et la Direction les ajoutent, les lèvent
--    et les suppriment ; tout le service de la protection et les ressources humaines les lisent. Le guichet
--    avertit l'agent dès que le nom ou le numéro de la pièce correspond, à l'entrée comme au contrôle.
-- 2. Visiteurs attendus (collection securiteAttendus) : annoncés par le service de la protection, ou par
--    la Direction, l'Inspection et les RH depuis un rendez-vous de l'agenda. À l'arrivée, l'agent note
--    l'entrée et la personne visitée reçoit un message dans Mon espace (fonction annoncer_visiteur).
--
-- À exécuter après supabase/v41_photos_profil.sql. Il peut être exécuté plusieurs fois.

begin;

-- 1. Écriture : le service de la protection (signalements : responsables) ; visiteurs attendus : aussi
--    l'Inspection et les RH (la Direction écrit tout, comme avant) ------------------------------------------
create or replace function public.ecriture_securite(p_collection text, p_data jsonb)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (public.ma_protection() is not null
          and (p_collection in ('securiteEntrees', 'securiteControles', 'securiteAttendus')
               or (p_collection = 'securiteRapports'
                   and (public.ma_protection() = 'responsable' or p_data->>'fid' = public.mon_fonctionnaire()))
               or (p_collection = 'securiteSignalements' and public.ma_protection() = 'responsable')))
      or (p_collection = 'securiteAttendus' and coalesce(public.mon_role(), '') in ('inspecteur', 'rh'))
$$;
revoke all on function public.ecriture_securite(text, jsonb) from public, anon;
grant execute on function public.ecriture_securite(text, jsonb) to authenticated;

-- 2. Lecture : comme la mise à jour 39, plus les deux nouvelles collections ---------------------------------
drop policy if exists "registre lecture" on public.registre;
create policy "registre lecture" on public.registre for select to authenticated using (
  (select public.mon_role()) in ('direction', 'inspecteur', 'lecture')
  or ((select public.mon_role()) = 'rh'
      and (collection in ('config', 'fonctionnaires', 'contratsTravail', 'rh', 'messagesAgents', 'agenda', 'absences', 'notesService', 'sanctions', 'demandesAgents', 'entretiens',
                          'securiteEntrees', 'securiteControles', 'securiteRapports', 'securiteSignalements', 'securiteAttendus')
           or (collection = 'rappels' and data->>'origine' = 'retenue' and coalesce(data->>'sanction', '') <> '')))
  or ((select public.mon_role()) = 'pointeuse' and collection = 'pointages'
      and data->>'discordId' = (select public.mon_discord())
      and now() < timestamptz '2026-11-09 00:00:00 Europe/Paris')
  or (collection in ('securiteEntrees', 'securiteControles', 'securiteRapports', 'securiteSignalements', 'securiteAttendus')
      and (select public.ma_protection()) is not null));

-- 3. Suppression : comme la mise à jour 38, plus les deux nouvelles collections pour les responsables --------
drop policy if exists "registre suppression" on public.registre;
create policy "registre suppression" on public.registre for delete to authenticated using (
  (select public.mon_role()) = 'direction'
  or ((select public.mon_role()) = 'rh' and collection = 'contratsTravail' and coalesce(data->>'statut', '') <> 'signe')
  or (collection in ('securiteEntrees', 'securiteControles', 'securiteRapports', 'securiteSignalements', 'securiteAttendus')
      and (select public.ma_protection()) = 'responsable'));

-- 4. Visiteur arrivé : message à la personne visitée (une seule fois par visite) ----------------------------
create or replace function public.annoncer_visiteur(p_attendu text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_a    jsonb;
  v_f    jsonb;
  v_fid  text;
  v_id   text;
  v_at   text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_txt  text;
begin
  if public.ma_protection() is null and coalesce(public.mon_role(), '') <> 'direction' then
    raise exception 'Réservé au service de la protection.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('guichet-visiteur:' || coalesce(p_attendu, '')));
  select r.data into v_a from public.registre r where r.collection = 'securiteAttendus' and r.id = p_attendu;
  if v_a is null or coalesce(v_a->>'statut', '') <> 'arrive' or coalesce(v_a->>'annonceLe', '') <> '' then
    return false;
  end if;
  v_fid := nullif(btrim(coalesce(v_a->>'hoteFid', '')), '');
  if v_fid is null then
    return false;
  end if;
  select f.data into v_f from public.registre f
   where f.collection = 'fonctionnaires' and f.id = v_fid and coalesce(f.data->>'actif', 'true') <> 'false';
  if v_f is null then
    return false;
  end if;
  v_txt := 'Votre visiteur ' || coalesce(nullif(btrim(v_a->>'nom'), ''), 'attendu')
        || coalesce(' (' || nullif(btrim(v_a->>'qualite'), '') || ')', '')
        || ' est arrivé à l''accueil de la Préfecture à '
        || to_char(coalesce((v_a->>'arriveLe')::timestamptz, now()) at time zone 'Europe/Paris', 'HH24"h"MI') || '.';
  v_id := 'm' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSMS') || substr(md5(random()::text || v_fid), 1, 6);
  insert into public.registre (collection, id, data) values ('messagesAgents', v_id, jsonb_build_object(
    'fid', v_fid, 'nom', coalesce(v_f->>'nom', ''), 'discordId', coalesce(v_f->>'discordId', ''), 'de', 'equipe',
    'auteur', 'Accueil · service de la protection', 'auteurRole', 'securite', 'texte', v_txt, 'at', v_at, 'luAgent', false,
    'visiteur', p_attendu));
  update public.registre set data = data || jsonb_build_object('annonceLe', v_at, 'message', v_id)
   where collection = 'securiteAttendus' and id = p_attendu;
  return true;
end
$$;
revoke all on function public.annoncer_visiteur(text) from public, anon;
grant execute on function public.annoncer_visiteur(text) to authenticated;

commit;
