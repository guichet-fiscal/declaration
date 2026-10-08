-- =====================================================================
-- Guichet fiscal : mise à jour 2 (journal des actions + export Google Sheets)
-- À exécuter une fois après schema.sql : SQL Editor → New query → coller → Run.
-- Le script peut être relancé sans risque.
-- =====================================================================

-- 7. Journal des actions ------------------------------------------------
-- Chaque ajout, modification ou suppression dans le registre et dans la
-- liste des agents est inscrit ici automatiquement par la base.
-- Personne ne peut écrire, modifier ou effacer une ligne du journal
-- depuis le site : seule la base elle-même y écrit.
create table if not exists public.journal (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  discord_id text,
  auteur     text,
  action     text not null check (action in ('ajout', 'modification', 'suppression')),
  collection text not null,
  doc_id     text not null,
  avant      jsonb,
  apres      jsonb
);
create index if not exists journal_at_idx on public.journal (at desc);

create or replace function public.journal_auteur(out v_discord text, out v_nom text)
language sql stable security definer
set search_path = ''
as $$
  select i.provider_id, a.nom
  from auth.identities i
  left join public.agents a on a.discord_id = i.provider_id
  where i.user_id = auth.uid() and i.provider = 'discord'
  limit 1
$$;
revoke all on function public.journal_auteur() from public, anon, authenticated;

create or replace function public.journaliser_registre()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_discord text;
  v_nom     text;
begin
  select * into v_discord, v_nom from public.journal_auteur();
  if tg_op = 'DELETE' then
    insert into public.journal (user_id, discord_id, auteur, action, collection, doc_id, avant, apres)
    values (auth.uid(), v_discord, v_nom, 'suppression', old.collection, old.id, old.data, null);
    return old;
  elsif tg_op = 'INSERT' then
    insert into public.journal (user_id, discord_id, auteur, action, collection, doc_id, avant, apres)
    values (auth.uid(), v_discord, v_nom, 'ajout', new.collection, new.id, null, new.data);
    return new;
  else
    if old.data is not distinct from new.data then
      return new;
    end if;
    insert into public.journal (user_id, discord_id, auteur, action, collection, doc_id, avant, apres)
    values (auth.uid(), v_discord, v_nom, 'modification', new.collection, new.id, old.data, new.data);
    return new;
  end if;
end
$$;
revoke all on function public.journaliser_registre() from public, anon, authenticated;

drop trigger if exists registre_journal on public.registre;
create trigger registre_journal
  after insert or update or delete on public.registre
  for each row execute function public.journaliser_registre();

create or replace function public.journaliser_agents()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_discord text;
  v_nom     text;
begin
  select * into v_discord, v_nom from public.journal_auteur();
  if tg_op = 'DELETE' then
    insert into public.journal (user_id, discord_id, auteur, action, collection, doc_id, avant, apres)
    values (auth.uid(), v_discord, v_nom, 'suppression', 'agents', old.discord_id, to_jsonb(old), null);
    return old;
  elsif tg_op = 'INSERT' then
    insert into public.journal (user_id, discord_id, auteur, action, collection, doc_id, avant, apres)
    values (auth.uid(), v_discord, v_nom, 'ajout', 'agents', new.discord_id, null, to_jsonb(new));
    return new;
  else
    insert into public.journal (user_id, discord_id, auteur, action, collection, doc_id, avant, apres)
    values (auth.uid(), v_discord, v_nom, 'modification', 'agents', new.discord_id, to_jsonb(old), to_jsonb(new));
    return new;
  end if;
end
$$;
revoke all on function public.journaliser_agents() from public, anon, authenticated;

drop trigger if exists agents_journal on public.agents;
create trigger agents_journal
  after insert or update or delete on public.agents
  for each row execute function public.journaliser_agents();

alter table public.journal enable row level security;
revoke all on public.journal from anon, authenticated;
grant select on public.journal to authenticated;
drop policy if exists "journal lecture" on public.journal;
create policy "journal lecture" on public.journal for select to authenticated using (public.mon_role() is not null);

-- 8. Export vers Google Sheets ---------------------------------------
-- Une clé d'export permet à une feuille Google Sheets de lire le registre
-- sans compte Discord. Seule son empreinte est conservée : la clé n'est
-- affichée qu'une fois, au moment où la Direction la crée.
create table if not exists public.cles_export (
  id                    bigint generated always as identity primary key,
  nom                   text not null default '',
  empreinte             text not null unique,
  cree_le               timestamptz not null default now(),
  cree_par              uuid,
  derniere_utilisation  timestamptz
);
alter table public.cles_export enable row level security;
revoke all on public.cles_export from anon, authenticated;
grant select (id, nom, cree_le, derniere_utilisation) on public.cles_export to authenticated;
grant delete on public.cles_export to authenticated;
drop policy if exists "cles lecture" on public.cles_export;
drop policy if exists "cles suppression" on public.cles_export;
create policy "cles lecture"     on public.cles_export for select to authenticated using (public.mon_role() = 'direction');
create policy "cles suppression" on public.cles_export for delete to authenticated using (public.mon_role() = 'direction');

create or replace function public.creer_cle_export(p_nom text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_cle text;
begin
  if public.mon_role() is distinct from 'direction' then
    raise exception 'Réservé à la Direction' using errcode = '42501';
  end if;
  v_cle := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.cles_export (nom, empreinte, cree_par)
  values (left(coalesce(p_nom, ''), 80), encode(sha256(convert_to(v_cle, 'UTF8')), 'hex'), auth.uid());
  return v_cle;
end
$$;
revoke all on function public.creer_cle_export(text) from public, anon;
grant execute on function public.creer_cle_export(text) to authenticated;

create or replace function public.export_registre(p_cle text)
returns json
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id  bigint;
  v_res json;
begin
  select c.id into v_id
  from public.cles_export c
  where c.empreinte = encode(sha256(convert_to(coalesce(p_cle, ''), 'UTF8')), 'hex');
  if v_id is null then
    raise exception 'Clé d''export invalide' using errcode = '28000';
  end if;
  update public.cles_export set derniere_utilisation = now() where id = v_id;
  select json_build_object(
    'genere_le', now(),
    'registre', coalesce((
      select json_agg(json_build_object('collection', r.collection, 'id', r.id, 'data', r.data, 'modifie_le', r.updated_at))
      from public.registre r), '[]'::json),
    'journal', coalesce((
      select json_agg(j)
      from (select at, auteur, action, collection, doc_id, avant, apres
            from public.journal order by at desc limit 3000) j), '[]'::json)
  ) into v_res;
  return v_res;
end
$$;
revoke all on function public.export_registre(text) from public;
grant execute on function public.export_registre(text) to anon, authenticated;
