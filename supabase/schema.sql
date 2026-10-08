-- =====================================================================
-- Guichet fiscal : schéma de la base Supabase
-- À exécuter une fois : Supabase → SQL Editor → New query → coller → Run.
-- AVANT de lancer : remplacez VOTRE_ID_DISCORD (section 6, en bas)
-- par votre identifiant Discord. Le script peut être relancé sans risque.
-- =====================================================================

-- 1. Tables ------------------------------------------------------------
-- Toutes les données du guichet (barème, entreprises, déclarations,
-- avis, demandes, arbitrages) : une ligne par dossier.
create table if not exists public.registre (
  collection text        not null,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (collection, id)
);

-- Les personnes autorisées, repérées par leur identifiant Discord.
create table if not exists public.agents (
  discord_id text primary key check (discord_id ~ '^[0-9]{15,21}$'),
  nom        text not null default '',
  role       text not null check (role in ('direction', 'lecture')),
  ajoute_le  timestamptz not null default now()
);

-- 2. Rôle de la personne connectée ------------------------------------
-- Lu depuis son identité Discord vérifiée (auth.identities), qu'un
-- utilisateur ne peut pas modifier lui-même.
create or replace function public.mon_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select a.role
  from public.agents a
  join auth.identities i
    on i.provider = 'discord' and i.provider_id = a.discord_id
  where i.user_id = auth.uid()
  limit 1
$$;

create or replace function public.mon_acces()
returns json
language sql stable security definer
set search_path = ''
as $$
  select json_build_object(
    'discord_id', (select i.provider_id from auth.identities i
                   where i.user_id = auth.uid() and i.provider = 'discord' limit 1),
    'role',       public.mon_role(),
    'nom',        (select a.nom from public.agents a
                   join auth.identities i on i.provider = 'discord' and i.provider_id = a.discord_id
                   where i.user_id = auth.uid() limit 1)
  )
$$;

revoke all on function public.mon_role()  from public, anon;
revoke all on function public.mon_acces() from public, anon;
grant execute on function public.mon_role()  to authenticated;
grant execute on function public.mon_acces() to authenticated;

-- 3. Horodatage automatique de chaque modification --------------------
create or replace function public.registre_horodatage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end
$$;

drop trigger if exists registre_horodatage on public.registre;
create trigger registre_horodatage
  before insert or update on public.registre
  for each row execute function public.registre_horodatage();

-- 4. Droits d'accès ------------------------------------------------------
-- Direction : lit et écrit. Lecture seule : lit. Tous les autres : rien.
alter table public.registre enable row level security;
alter table public.agents   enable row level security;

revoke all on public.registre, public.agents from anon;
grant select, insert, update, delete on public.registre, public.agents to authenticated;

drop policy if exists "registre lecture"      on public.registre;
drop policy if exists "registre ajout"        on public.registre;
drop policy if exists "registre modification" on public.registre;
drop policy if exists "registre suppression"  on public.registre;
create policy "registre lecture"      on public.registre for select to authenticated using (public.mon_role() is not null);
create policy "registre ajout"        on public.registre for insert to authenticated with check (public.mon_role() = 'direction');
create policy "registre modification" on public.registre for update to authenticated using (public.mon_role() = 'direction') with check (public.mon_role() = 'direction');
create policy "registre suppression"  on public.registre for delete to authenticated using (public.mon_role() = 'direction');

drop policy if exists "agents lecture"      on public.agents;
drop policy if exists "agents ajout"        on public.agents;
drop policy if exists "agents modification" on public.agents;
drop policy if exists "agents suppression"  on public.agents;
create policy "agents lecture"      on public.agents for select to authenticated using (public.mon_role() is not null);
create policy "agents ajout"        on public.agents for insert to authenticated with check (public.mon_role() = 'direction');
create policy "agents modification" on public.agents for update to authenticated using (public.mon_role() = 'direction') with check (public.mon_role() = 'direction');
create policy "agents suppression"  on public.agents for delete to authenticated using (public.mon_role() = 'direction');

-- 5. Mises à jour en direct entre agents --------------------------------
do $$
begin
  alter publication supabase_realtime add table public.registre;
exception when duplicate_object then null;
end
$$;

-- 6. Premier accès Direction ----------------------------------------------
-- Remplacez VOTRE_ID_DISCORD par votre identifiant (17 à 20 chiffres).
insert into public.agents (discord_id, nom, role)
values ('VOTRE_ID_DISCORD', 'Directeur', 'direction')
on conflict (discord_id) do update set role = 'direction';
