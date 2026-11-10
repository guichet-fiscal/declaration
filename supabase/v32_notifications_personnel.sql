-- Guichet fiscal : mise à jour 32 (notifications du personnel, sur téléphone, ordinateur et Discord)
--
-- 1. Les fonctionnaires (espace de la mise à jour 30) et les ressources humaines peuvent activer les
--    notifications sur leurs appareils (bouton cloche du bandeau).
-- 2. La base prévient le service « notifier » quand un message, un rendez-vous, une note de service ou
--    une absence est enregistré, et quand une paye est versée. Le service notifie :
--     - le fonctionnaire concerné (message de l'encadrement, rendez-vous, note de service, absence prise
--       en compte, paye versée avec son montant, rappel une heure avant un rendez-vous) ;
--     - l'encadrement abonné à « Personnel » (message d'un fonctionnaire, absence signalée) ;
--     - les salons Discord réglés au guichet (Réglages → Discord : « Alertes du personnel » pour les
--       fonctionnaires, avec la mention de l'agent ; « Direction » pour l'encadrement). Le contenu des
--       messages et des sanctions n'est jamais posté sur Discord.
--
-- À exécuter après supabase/v31_sanctions.sql (et v10, v18 pour les notifications). Il peut être exécuté
-- plusieurs fois. Le service « notifier » doit être à jour (déployé le 10 novembre 2026).

begin;

-- 1. Qui peut s'abonner : l'encadrement (Direction, Inspection, ressources humaines, lecture seule) et
--    tout fonctionnaire en service relié à son compte Discord ---------------------------------------------
drop policy if exists "notif ajout" on public.notif_abonnements;
create policy "notif ajout" on public.notif_abonnements for insert to authenticated
  with check (user_id = auth.uid()
              and ((select public.mon_role()) in ('direction', 'inspecteur', 'lecture', 'rh')
                   or (select public.mon_fonctionnaire()) is not null));
drop policy if exists "notif modification" on public.notif_abonnements;
create policy "notif modification" on public.notif_abonnements for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
              and ((select public.mon_role()) in ('direction', 'inspecteur', 'lecture', 'rh')
                   or (select public.mon_fonctionnaire()) is not null));

-- 2. Destinataires du côté de l'encadrement : les ressources humaines en font partie ------------------------
create or replace function public.notif_destinataires(p_type text, p_auteur uuid)
returns setof public.notif_abonnements
language sql stable security definer
set search_path = ''
as $$
  select s.*
  from public.notif_abonnements s
  where s.prefs ? p_type
    and (p_auteur is null or s.user_id <> p_auteur)
    and exists (
      select 1 from auth.identities i
      join public.agents a on i.provider = 'discord' and i.provider_id = a.discord_id
      where i.user_id = s.user_id and a.role in ('direction', 'inspecteur', 'lecture', 'rh'))
$$;
revoke all on function public.notif_destinataires(text, uuid) from public, anon, authenticated;
grant execute on function public.notif_destinataires(text, uuid) to service_role;

-- 3. Destinataires du côté des fonctionnaires : les appareils des agents visés (tous si p_fids est nul) ------
create or replace function public.notif_agents(p_fids text[], p_type text)
returns table (fid text, endpoint text, p256dh text, auth text)
language sql stable security definer
set search_path = ''
as $$
  select f.id, s.endpoint, s.p256dh, s.auth
  from public.registre f
  join auth.identities i on i.provider = 'discord' and i.provider_id = f.data->>'discordId'
  join public.notif_abonnements s on s.user_id = i.user_id
  where f.collection = 'fonctionnaires'
    and coalesce(f.data->>'actif', 'true') <> 'false'
    and (p_fids is null or f.id = any (p_fids))
    and s.prefs ? p_type
$$;
revoke all on function public.notif_agents(text[], text) from public, anon, authenticated;
grant execute on function public.notif_agents(text[], text) to service_role;

-- 4. La base prévient le service (même fonction que la mise à jour 10) ---------------------------------------
-- Ajouts : message, rendez-vous, note de service, absence.
drop trigger if exists notif_personnel_ajout on public.registre;
create trigger notif_personnel_ajout
  after insert on public.registre
  for each row
  when (new.collection in ('messagesAgents', 'agenda', 'notesService', 'absences'))
  execute function public.notif_registre();
-- Changements utiles seulement : rendez-vous annulé ou déplacé, absence prise en compte ou annulée.
drop trigger if exists notif_personnel_modif on public.registre;
create trigger notif_personnel_modif
  after update on public.registre
  for each row
  when ((new.collection = 'agenda' and (new.data->>'statut' is distinct from old.data->>'statut'
                                         or new.data->>'debut' is distinct from old.data->>'debut'))
        or (new.collection = 'absences' and new.data->>'statut' is distinct from old.data->>'statut'))
  execute function public.notif_registre();
-- Paye versée.
drop trigger if exists notif_payes on public.registre;
create trigger notif_payes
  after update on public.registre
  for each row
  when (new.collection = 'payes' and new.data->>'statut' = 'versee' and old.data->>'statut' is distinct from 'versee')
  execute function public.notif_registre();

commit;
