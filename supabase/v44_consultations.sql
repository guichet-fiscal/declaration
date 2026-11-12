-- Guichet fiscal : mise à jour 44 (journal des consultations)
--
-- Qui a ouvert quel dossier sensible : fiche d'une entreprise, déclaration, contrôle fiscal, demande d'un
-- service réservé, fiche d'un fonctionnaire, entrée, contrôle d'identité ou personne signalée de la
-- sécurité. Le guichet le note à l'ouverture (fonction noter_consultation : une ligne par personne et par
-- dossier toutes les 10 minutes au plus) ; seule la Direction lit ce journal (Outils → Journal →
-- Consultations). Personne ne l'écrit ni ne l'efface directement ; les lignes de plus de 90 jours partent
-- d'elles-mêmes.
--
-- À exécuter après supabase/v43_creneaux_paiement.sql. Il peut être exécuté plusieurs fois.

begin;

create table if not exists public.consultations (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  uid        uuid,
  discord    text,
  nom        text,
  role       text,
  collection text not null,
  doc_id     text not null,
  libelle    text
);
create index if not exists consultations_at on public.consultations (at desc);
create index if not exists consultations_doc on public.consultations (collection, doc_id);
create index if not exists consultations_uid on public.consultations (uid, collection, doc_id, at desc);

alter table public.consultations enable row level security;
revoke all on public.consultations from public, anon, authenticated;
grant select on public.consultations to authenticated;
drop policy if exists "consultations lecture" on public.consultations;
create policy "consultations lecture" on public.consultations for select to authenticated
  using ((select public.mon_role()) = 'direction');

create or replace function public.noter_consultation(p_collection text, p_doc text, p_libelle text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_discord text := public.mon_discord();
  v_role    text := public.mon_role();
  v_fid     text := public.mon_fonctionnaire();
  v_nom     text;
begin
  if v_uid is null or coalesce(btrim(p_collection), '') = '' or coalesce(btrim(p_doc), '') = '' then
    return;
  end if;
  if v_role is null and v_fid is null then
    return;
  end if;
  if exists (select 1 from public.consultations c
             where c.uid = v_uid and c.collection = p_collection and c.doc_id = p_doc and c.at > now() - interval '10 minutes') then
    return;
  end if;
  select a.nom into v_nom from public.agents a where a.discord_id = v_discord;
  if v_nom is null and v_fid is not null then
    select f.data->>'nom' into v_nom from public.registre f where f.collection = 'fonctionnaires' and f.id = v_fid;
  end if;
  insert into public.consultations (uid, discord, nom, role, collection, doc_id, libelle)
  values (v_uid, v_discord, v_nom,
          coalesce(v_role, case when public.ma_protection() is not null then 'protection' else 'agent' end),
          left(p_collection, 60), left(p_doc, 120), left(coalesce(p_libelle, ''), 200));
  if random() < 0.02 then
    delete from public.consultations where at < now() - interval '90 days';
  end if;
end
$$;
revoke all on function public.noter_consultation(text, text, text) from public, anon;
grant execute on function public.noter_consultation(text, text, text) to authenticated;

commit;
