-- Guichet fiscal : mise à jour 23 (suppression des conventions)
--
-- La Direction peut supprimer une convention de partenariat faite par erreur ou pour un essai, même
-- signée ou résiliée, tant qu'aucune prestation validée n'y est rattachée. Une convention qui a servi
-- (prestations validées) ne se supprime toujours pas : on la résilie. Le reste ne change pas : une
-- convention signée ne se modifie plus, une résiliation ne se modifie plus.
--
-- À exécuter après supabase/v22_espace_convocations.sql. Il peut être exécuté plusieurs fois.

begin;

create or replace function public.verrou_convention()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  o  jsonb := old.data;
  n  jsonb := new.data;
  so text  := coalesce(old.data->>'statut', 'projet');
  sn text  := coalesce(new.data->>'statut', 'projet');
  k  text;
begin
  if tg_op = 'DELETE' then
    if so not in ('projet', 'annulee') and exists (
      select 1 from public.registre p
      where p.collection = 'prestations' and p.data->>'conventionId' = old.id
        and coalesce(p.data->>'statut', 'a_valider') = 'validee') then
      raise exception 'Cette convention a des prestations validées : annulez-les avant de la supprimer, ou résiliez-la.';
    end if;
    return old;
  end if;
  if so not in ('projet', 'annulee') then
    foreach k in array array['entrepriseId', 'objet', 'signataire', 'services', 'avantages', 'debut', 'fin', 'mecenat', 'taux', 'forfait', 'conditions', 'signeLe', 'signeParNom'] loop
      if public.jn(n->k) is distinct from public.jn(o->k) then
        raise exception 'Une convention signée ne se modifie plus : résiliez-la et signez-en une nouvelle.';
      end if;
    end loop;
  end if;
  -- Le montant de la réduction est un nombre entier positif (ou absent).
  if coalesce(jsonb_typeof(n->'forfait'), 'null') <> 'null' then
    if jsonb_typeof(n->'forfait') <> 'number' then
      raise exception 'La réduction d''impôt d''une convention est un montant entier positif.';
    end if;
    if (n->>'forfait')::numeric < 0 or (n->>'forfait')::numeric <> trunc((n->>'forfait')::numeric) then
      raise exception 'La réduction d''impôt d''une convention est un montant entier positif.';
    end if;
  end if;
  if so = 'resiliee' and public.jn(n->'resiliation') is distinct from public.jn(o->'resiliation') then
    raise exception 'Une résiliation enregistrée ne se modifie plus.';
  end if;
  if so <> sn and not ((so = 'projet' and sn in ('signee', 'annulee')) or (so = 'signee' and sn = 'resiliee')) then
    raise exception 'Cette convention vient de changer d''état : rouvrez-la pour voir où elle en est.';
  end if;
  return new;
end
$$;

commit;
