-- Guichet fiscal : mise à jour 36 (espace des fonctionnaires complété)
--
-- 1. Signature du contrat de travail par l'agent lui-même, depuis son espace.
--
-- À exécuter après supabase/v35_rappels_agenda.sql. Il peut être exécuté plusieurs fois.

begin;

-- 1. Signature du contrat par l'agent ------------------------------------------------------------
-- L'agent signe son propre contrat « à signer » : date du jour (heure de Paris), « Lu et approuvé »
-- et son nom tel qu'il l'a tapé. Le contrat est alors figé, comme quand les RH enregistrent la signature.
create or replace function public.signer_contrat(p_id text, p_nom text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_fid text := public.mon_fonctionnaire();
  v_data jsonb;
begin
  if v_fid is null then
    raise exception 'Votre compte Discord n''est relié à aucune fiche de fonctionnaire.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_nom, ''))) < 2 then raise exception 'Tapez votre nom pour signer.' using errcode = 'P0001'; end if;
  select data into v_data from public.registre
    where collection = 'contratsTravail' and id = p_id and data->>'fid' = v_fid for update;
  if v_data is null then raise exception 'Ce contrat n''est pas le vôtre ou n''existe plus.' using errcode = 'P0001'; end if;
  if coalesce(v_data->>'statut', 'a_signer') = 'signe' then raise exception 'Ce contrat est déjà signé.' using errcode = 'P0001'; end if;
  v_data := v_data || jsonb_build_object(
    'statut', 'signe',
    'salarieSigneLe', to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD'),
    'signeEnregistrePar', 'l’agent, depuis son espace',
    'signeParAgent', true,
    'signatureNom', left(btrim(p_nom), 80),
    'signeA', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'modifieLe', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  update public.registre set data = v_data where collection = 'contratsTravail' and id = p_id;
  return v_data || jsonb_build_object('id', p_id);
end;
$$;
revoke all on function public.signer_contrat(text, text) from public, anon;
grant execute on function public.signer_contrat(text, text) to authenticated;

commit;
