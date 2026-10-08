-- =====================================================================
-- Guichet fiscal : mise à jour 4 · Rôle Inspection et clôture des semaines
-- À exécuter une fois après schema.sql, v2_journal_export.sql et
-- v3_discord.sql : SQL Editor → New query → coller → Run.
-- Le script peut être relancé sans risque.
-- =====================================================================

-- 1. Rôle « inspecteur » -------------------------------------------------
-- Direction : tout.
-- Inspection : saisit les déclarations et les demandes, émet les avis,
-- place un dossier en contrôle, relance les entreprises et délivre les
-- attestations de régularité (sans pouvoir les révoquer). Elle
-- n'encaisse pas, n'annule pas, ne supprime pas, n'arbitre pas les
-- demandes et ne touche ni aux réglages ni aux accès.
-- Lecture seule : consulte.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.agents'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.agents drop constraint %I', c.conname);
  end loop;
end
$$;
alter table public.agents
  add constraint agents_role_check check (role in ('direction', 'inspecteur', 'lecture'));

-- Ce que la personne connectée peut écrire dans le registre.
-- Appelée deux fois pour une modification : sur le dossier avant (using)
-- et sur le dossier après (with check). L'Inspection ne peut donc pas
-- reprendre un avis déjà payé, ni le transformer en paiement.
create or replace function public.ecriture_permise(p_collection text, p_id text, p_data jsonb)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case public.mon_role()
    when 'direction' then true
    when 'inspecteur' then
      p_collection in ('demandes', 'relances')
      or (p_collection = 'attestations' and p_data->>'revoqueeLe' is null)
      or (p_collection = 'decisions' and coalesce(p_data->>'statut', '') in ('validee', 'controle'))
      or (p_collection = 'declarations' and not exists (
            select 1 from public.registre r
            where r.collection = 'decisions' and r.id = p_id and r.data->>'statut' = 'payee'))
    else false
  end
$$;
revoke all on function public.ecriture_permise(text, text, jsonb) from public, anon;
grant execute on function public.ecriture_permise(text, text, jsonb) to authenticated;

drop policy if exists "registre ajout"        on public.registre;
drop policy if exists "registre modification" on public.registre;
drop policy if exists "registre suppression"  on public.registre;
create policy "registre ajout" on public.registre for insert to authenticated
  with check (public.ecriture_permise(collection, id, data));
create policy "registre modification" on public.registre for update to authenticated
  using (public.ecriture_permise(collection, id, data))
  with check (public.ecriture_permise(collection, id, data));
create policy "registre suppression" on public.registre for delete to authenticated
  using (public.mon_role() = 'direction');

-- L'Inspection publie aussi sur Discord : elle lit les adresses des salons,
-- sans pouvoir les modifier.
drop policy if exists "prives lecture" on public.parametres_prives;
create policy "prives lecture" on public.parametres_prives for select to authenticated
  using (public.mon_role() in ('direction', 'inspecteur'));

-- 2. Semaines clôturées --------------------------------------------------
-- Une période clôturée (ligne « clotures/<période> » du registre) est
-- verrouillée : on n'y ajoute plus de déclaration, on n'en modifie ni
-- n'en supprime, et le montant de ses avis ne change plus. Les
-- encaissements, échéanciers, pénalités et relances restent possibles,
-- de même qu'un changement de nom d'entreprise. La Direction peut rouvrir
-- la période à tout moment.
create or replace function public.periode_cloturee(p_periode text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_periode is not null and exists (
    select 1 from public.registre r where r.collection = 'clotures' and r.id = p_periode)
$$;
revoke all on function public.periode_cloturee(text) from public, anon;

create or replace function public.verrou_cloture()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_periode text;
begin
  if tg_op = 'INSERT' then
    -- Un « set » du site arrive en insert … on conflict : la ligne existe déjà,
    -- c'est donc une modification, contrôlée plus bas par le déclencheur d'update.
    if exists (select 1 from public.registre r where r.collection = new.collection and r.id = new.id) then
      return new;
    end if;
    if new.collection = 'declarations' and public.periode_cloturee(new.data->>'periode') then
      raise exception 'Semaine clôturée : la Direction doit la rouvrir avant d''y ajouter une déclaration.';
    end if;
    return new;
  end if;

  if old.collection = 'declarations' then
    if public.periode_cloturee(old.data->>'periode') then
      if tg_op = 'DELETE' then
        raise exception 'Semaine clôturée : la Direction doit la rouvrir avant de supprimer cette déclaration.';
      end if;
      if (old.data - 'entrepriseNom' - 'entrepriseId') is distinct from (new.data - 'entrepriseNom' - 'entrepriseId') then
        raise exception 'Semaine clôturée : la Direction doit la rouvrir avant de modifier cette déclaration.';
      end if;
    end if;
    if tg_op = 'UPDATE' and (old.data->>'periode') is distinct from (new.data->>'periode')
       and public.periode_cloturee(new.data->>'periode') then
      raise exception 'Semaine clôturée : la Direction doit la rouvrir avant d''y déplacer une déclaration.';
    end if;
  elsif old.collection = 'decisions' then
    select r.data->>'periode' into v_periode
    from public.registre r where r.collection = 'declarations' and r.id = old.id;
    if public.periode_cloturee(v_periode) then
      if tg_op = 'DELETE' then
        raise exception 'Semaine clôturée : la Direction doit la rouvrir avant d''effacer cet avis.';
      end if;
      if (old.data->'montant') is distinct from (new.data->'montant') then
        raise exception 'Semaine clôturée : la Direction doit la rouvrir avant de changer le montant de cet avis.';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;
revoke all on function public.verrou_cloture() from public, anon, authenticated;

drop trigger if exists registre_cloture on public.registre;
create trigger registre_cloture
  before insert or update or delete on public.registre
  for each row execute function public.verrou_cloture();
