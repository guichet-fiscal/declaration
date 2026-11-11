-- Guichet fiscal : mise à jour 37 (remontée des erreurs, auteurs du journal)
--
-- Quand le guichet plante chez quelqu'un (page, enregistrement refusé, lecture de la base, publication
-- Discord), il note l'erreur ici avec le navigateur, l'appareil et l'onglet ouvert. La Direction la
-- retrouve dans Réglages → Sauvegardes et export → Erreurs remontées, et « Marquer comme réglée » l'efface.
-- Rien de ce que la personne a tapé n'est envoyé ; un mois d'historique ; 50 erreurs par personne et
-- par heure au plus.
--
-- Journal : les gestes faits par un fonctionnaire depuis Mon espace (message, absence, réponse à l'agenda,
-- demande…) portent désormais son nom, celui de sa fiche, au lieu de « Sans nom » ; les lignes déjà
-- écrites sont complétées.
--
-- À exécuter après supabase/v36_espace_complet.sql. Il peut être exécuté plusieurs fois.

begin;

create table if not exists public.erreurs_client (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  user_id     uuid,
  discord     text,
  nom         text,
  role        text,
  type        text not null default 'erreur',
  message     text not null,
  source      text,
  pile        text,
  onglet      text,
  navigateur  text,
  appareil    text,
  version     text,
  empreinte   text not null,
  details     jsonb
);
create index if not exists erreurs_client_at on public.erreurs_client (at desc);
create index if not exists erreurs_client_empreinte on public.erreurs_client (empreinte, at desc);
create index if not exists erreurs_client_user on public.erreurs_client (user_id, at desc);

-- La Direction lit et efface ; personne n'écrit directement (seulement par signaler_erreur).
alter table public.erreurs_client enable row level security;
revoke all on public.erreurs_client from anon, authenticated;
grant select, delete on public.erreurs_client to authenticated;
drop policy if exists "erreurs lecture" on public.erreurs_client;
create policy "erreurs lecture" on public.erreurs_client
  for select to authenticated using ((select public.mon_role()) = 'direction');
drop policy if exists "erreurs effacement" on public.erreurs_client;
create policy "erreurs effacement" on public.erreurs_client
  for delete to authenticated using ((select public.mon_role()) = 'direction');

-- Une erreur vue par une personne connectée qui a un accès (rôle ou fiche de fonctionnaire).
create or replace function public.signaler_erreur(p jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text := public.mon_role();
  v_fid  text := public.mon_fonctionnaire();
  v_did  text := public.mon_discord();
  v_nom  text;
  v_msg  text := left(btrim(coalesce(p->>'message', '')), 500);
begin
  if v_uid is null or (v_role is null and v_fid is null) or v_msg = '' or jsonb_typeof(p) <> 'object' then
    return;
  end if;
  -- Une boucle d'erreurs ne remplit pas la table.
  if (select count(*) from public.erreurs_client e
      where e.user_id = v_uid and e.at > now() - interval '1 hour') >= 50 then
    return;
  end if;
  select a.nom into v_nom from public.agents a where a.discord_id = v_did;
  if coalesce(v_nom, '') = '' and v_fid is not null then
    select r.data->>'nom' into v_nom from public.registre r where r.collection = 'fonctionnaires' and r.id = v_fid;
  end if;
  insert into public.erreurs_client (user_id, discord, nom, role, type, message, source, pile, onglet, navigateur, appareil, version, empreinte, details)
  values (
    v_uid, v_did, left(v_nom, 80), coalesce(v_role, 'agent'),
    left(coalesce(nullif(p->>'type', ''), 'erreur'), 20), v_msg,
    left(p->>'source', 300), left(p->>'pile', 3000), left(p->>'onglet', 60),
    left(p->>'navigateur', 80), left(p->>'appareil', 80), left(p->>'version', 60),
    left(coalesce(nullif(p->>'empreinte', ''), md5(v_msg)), 64),
    case when jsonb_typeof(p->'details') = 'object' and length((p->'details')::text) <= 2000 then p->'details' end);
  -- Un mois d'historique suffit.
  delete from public.erreurs_client where at < now() - interval '30 days';
end
$$;
revoke all on function public.signaler_erreur(jsonb) from public, anon;
grant execute on function public.signaler_erreur(jsonb) to authenticated;

-- Journal : nom de l'auteur ---------------------------------------------------------------------------
-- Celui des accès (agents) ; à défaut, celui de la fiche de fonctionnaire qui porte ce compte Discord.
create or replace function public.journal_auteur(out v_discord text, out v_nom text)
language sql stable security definer
set search_path = ''
as $$
  select i.provider_id,
         coalesce(nullif(a.nom, ''),
                  (select r.data->>'nom' from public.registre r
                    where r.collection = 'fonctionnaires' and r.data->>'discordId' = i.provider_id
                    order by (r.data->>'actif' is distinct from 'false') desc
                    limit 1))
  from auth.identities i
  left join public.agents a on a.discord_id = i.provider_id
  where i.user_id = auth.uid() and i.provider = 'discord'
  limit 1
$$;
revoke all on function public.journal_auteur() from public, anon, authenticated;

-- Lignes déjà écrites sans nom alors que le compte Discord est connu.
update public.journal j
   set auteur = coalesce(
         (select nullif(a.nom, '') from public.agents a where a.discord_id = j.discord_id),
         (select r.data->>'nom' from public.registre r
           where r.collection = 'fonctionnaires' and r.data->>'discordId' = j.discord_id
           order by (r.data->>'actif' is distinct from 'false') desc
           limit 1))
 where coalesce(j.auteur, '') = '' and j.discord_id is not null;

commit;
