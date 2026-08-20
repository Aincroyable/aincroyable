-- ============================================================
-- Aincroyable — schéma Supabase
-- À exécuter dans l'éditeur SQL de ton projet Supabase.
-- ============================================================
--
-- NOTE DE SÉCURITÉ
-- La version précédente de ce fichier ouvrait la table des votes
-- en écriture directe :
--     create policy "anonymous users can update own browser token vote"
--     on public.votes for update using (true) ...
-- « using (true) » signifie « sur n'importe quelle ligne ». N'importe
-- quel visiteur pouvait donc réécrire les votes de tout le monde, la clé
-- anonyme étant forcément visible dans le JavaScript de la page.
--
-- Ici, plus aucune écriture directe n'est autorisée : le navigateur ne
-- peut appeler qu'une seule fonction, cast_vote(), qui n'accepte qu'une
-- note valide et ne touche qu'à la ligne du visiteur concerné.
-- ============================================================


create schema if not exists private;

-- ---------- Catalogue ----------
create table if not exists public.ainventions (
  slug       text primary key,
  name       text not null,
  city       text,
  created_at timestamptz not null default now()
);

-- ---------- Votes ----------
create table if not exists public.votes (
  ainvention_slug text not null references public.ainventions(slug) on delete cascade,
  voter_token     uuid not null,
  score           smallint not null check (score between 0 and 5),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (ainvention_slug, voter_token)
);

create index if not exists votes_slug_idx on public.votes (ainvention_slug);

-- ---------- Moyennes publiques ----------
-- security_invoker = off : la vue lit la table votes avec les droits de
-- son propriétaire, ce qui permet d'exposer les moyennes sans exposer
-- les votes individuels.
create or replace view public.rating_summary
with (security_invoker = off) as
select ainvention_slug          as slug,
       round(avg(score)::numeric, 2) as rating,
       count(*)::int            as votes
from public.votes
group by ainvention_slug;


-- ============================================================
-- Sécurité
-- ============================================================
alter table public.ainventions enable row level security;
alter table public.votes       enable row level security;

-- Le catalogue est public en lecture.
drop policy if exists "ainventions are public" on public.ainventions;
create policy "ainventions are public"
  on public.ainventions for select using (true);

-- Aucune politique sur public.votes : la table est donc totalement
-- inaccessible au rôle anonyme, ni en lecture ni en écriture.
drop policy if exists "votes are public for aggregate display"          on public.votes;
drop policy if exists "anonymous users can vote"                        on public.votes;
drop policy if exists "anonymous users can update own browser token vote" on public.votes;

-- On expose uniquement les moyennes.
grant select on public.rating_summary to anon, authenticated;
revoke all on public.votes from anon, authenticated;


-- ============================================================
-- Enregistrement d'un vote
-- ============================================================
-- Seule porte d'entrée en écriture. « security definer » lui donne le
-- droit d'écrire dans votes, mais elle ne peut rien faire d'autre que
-- poser ou remplacer la note d'un jeton donné sur une fiche donnée.
-- p_score est déclaré en integer, pas en smallint : PostgREST comme un
-- appel SQL direct passent alors un entier littéral sans transtypage
-- explicite. La colonne, elle, reste en smallint.
create or replace function public.cast_vote(
  p_slug  text,
  p_token uuid,
  p_score int
)
returns table (rating numeric, votes int)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_score is null or p_score < 0 or p_score > 5 then
    raise exception 'Note invalide : attendu un entier entre 0 et 5.';
  end if;

  if not exists (select 1 from public.ainventions a where a.slug = p_slug) then
    raise exception 'Fiche inconnue.';
  end if;

  insert into public.votes (ainvention_slug, voter_token, score)
  values (p_slug, p_token, p_score::smallint)
  on conflict (ainvention_slug, voter_token)
  do update set score = excluded.score, updated_at = now();

  return query
    select round(avg(v.score)::numeric, 2), count(*)::int
    from public.votes v
    where v.ainvention_slug = p_slug;
end;
$$;

revoke all on function public.cast_vote(text, uuid, int) from public;
grant execute on function public.cast_vote(text, uuid, int) to anon, authenticated;


-- ============================================================
-- Signalements d'erreur (privés)
-- ============================================================
-- L'adresse e-mail est facultative et sert uniquement à répondre.
-- Elle n'est jamais stockée en clair : la colonne contact_email_enc
-- contient une version chiffrée, illisible sans ta clé privée.
-- Voir chiffrement_email.sql pour la mise en place.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.reports (
  id                bigint generated by default as identity primary key,
  structure_slug    text,
  structure_name    text,
  structure_city    text,
  error_type        text not null,
  correction        text not null,
  source_url        text,
  contact_email_enc bytea,          -- adresse chiffrée, jamais en clair
  created_at        timestamptz not null default now(),
  status            text not null default 'new'
);

alter table public.reports enable row level security;

-- Aucune politique : la table est inaccessible au rôle anonyme, en lecture
-- comme en écriture. Tout passe par la fonction ci-dessous.
drop policy if exists "anyone can submit a catalogue report" on public.reports;
revoke all on public.reports from anon, authenticated;

-- Clé publique de chiffrement.
-- Tant qu'elle est vide, l'e-mail n'est tout simplement pas conservé :
-- le signalement est alors anonyme, ce qui est le comportement le plus sûr.
create table if not exists private.settings (
  key   text primary key,
  value text
);

create or replace function public.submit_report(
  p_slug        text,
  p_name        text,
  p_city        text,
  p_error_type  text,
  p_correction  text,
  p_source_url  text default null,
  p_email       text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pubkey text;
  v_enc    bytea := null;
begin
  if p_error_type is null or length(p_error_type) not between 1 and 80 then
    raise exception 'Type d''erreur invalide.';
  end if;
  if p_correction is null or length(p_correction) not between 1 and 5000 then
    raise exception 'Correction invalide.';
  end if;
  if p_email is not null and length(p_email) > 200 then
    raise exception 'Adresse trop longue.';
  end if;

  if p_email is not null and length(trim(p_email)) > 0 then
    select value into v_pubkey from private.settings where key = 'report_pubkey';
    if v_pubkey is not null and length(v_pubkey) > 0 then
      v_enc := extensions.pgp_pub_encrypt(trim(p_email), extensions.dearmor(v_pubkey));
    end if;
    -- Sans clé publique configurée, v_enc reste nul :
    -- l'adresse est écartée plutôt que stockée en clair.
  end if;

  insert into public.reports
    (structure_slug, structure_name, structure_city,
     error_type, correction, source_url, contact_email_enc)
  values
    (left(coalesce(p_slug,''),200), left(coalesce(p_name,''),200), left(coalesce(p_city,''),120),
     p_error_type, p_correction, left(coalesce(p_source_url,''),500), v_enc);
end;
$$;

revoke all on function public.submit_report(text,text,text,text,text,text,text) from public;
grant execute on function public.submit_report(text,text,text,text,text,text,text) to anon, authenticated;


-- ============================================================
-- Purge automatique
-- ============================================================
-- Moins on garde, moins on expose. Les signalements traités sont
-- effacés au bout de six mois.
create or replace function public.purge_old_reports()
returns integer
language sql
security definer
set search_path = public
as $$
  with d as (
    delete from public.reports
    where created_at < now() - interval '6 months'
    returning 1
  ) select count(*)::int from d;
$$;


-- ============================================================
-- Propositions de nouveaux noms ainventifs (privées)
-- ============================================================
-- Ce que les visiteurs envoient via « Proposer un nom ainventif ».
-- Table fermée : seule la fonction ci-dessous peut y écrire, et toi
-- seul peux la lire depuis le tableau de bord Supabase.

create table if not exists public.suggestions (
  id         bigint generated by default as identity primary key,
  name       text not null,
  city       text not null,
  url        text,
  created_at timestamptz not null default now(),
  status     text not null default 'new'
);

alter table public.suggestions enable row level security;
revoke all on public.suggestions from anon, authenticated;

create or replace function public.submit_suggestion(
  p_name text,
  p_city text,
  p_url  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_name is null or length(trim(p_name)) not between 1 and 200 then
    raise exception 'Nom invalide.';
  end if;
  if p_city is null or length(trim(p_city)) not between 1 and 120 then
    raise exception 'Commune invalide.';
  end if;
  if p_url is not null and length(p_url) > 500 then
    raise exception 'Lien trop long.';
  end if;

  insert into public.suggestions (name, city, url)
  values (trim(p_name), trim(p_city), nullif(trim(coalesce(p_url,'')), ''));
end;
$$;

revoke all on function public.submit_suggestion(text,text,text) from public;
grant execute on function public.submit_suggestion(text,text,text) to anon, authenticated;


-- ============================================================
-- Remplissage du catalogue
-- ============================================================
-- Le fichier seed_ainventions.sql, généré depuis data.js, contient les
-- INSERT correspondant aux fiches. À rejouer après chaque mise à jour
-- du catalogue : il est écrit pour être relançable sans doublon.
