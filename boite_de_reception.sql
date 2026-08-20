-- ============================================================
-- Boîte de réception — ce que les visiteurs t'ont envoyé
-- ============================================================
-- À coller dans l'éditeur SQL de Supabase (SQL Editor → New query).
-- Exécute un bloc à la fois : sélectionne les lignes voulues et Run.
--
-- Rien n'arrive par e-mail : ces tables SONT ta boîte de réception.
-- Elles sont inaccessibles depuis le site ; seul ce tableau de bord y accède.
-- ============================================================


-- ------------------------------------------------------------
-- 1. LES NOUVEAUTÉS — le réflexe quotidien
-- ------------------------------------------------------------
-- Propositions de noms et signalements d'erreurs pas encore traités,
-- les plus récents en premier.

select 'proposition' as type,
       id,
       created_at::date as le,
       name             as intitule,
       city             as commune,
       url              as detail
from public.suggestions
where status = 'new'

union all

select 'signalement',
       id,
       created_at::date,
       structure_name,
       structure_city,
       error_type || ' — ' || correction
from public.reports
where status = 'new'

order by le desc, type;


-- ------------------------------------------------------------
-- 2. LES PROPOSITIONS EN DÉTAIL
-- ------------------------------------------------------------
-- Les doublons évidents sont signalés : une proposition dont le nom
-- ressemble à une fiche déjà présente au catalogue.

select s.id,
       s.created_at::date as le,
       s.name,
       s.city,
       s.url,
       s.status,
       (select a.name
        from public.ainventions a
        where lower(a.name) = lower(s.name)
           or lower(a.name) like '%' || lower(s.name) || '%'
        limit 1) as deja_au_catalogue
from public.suggestions s
order by s.created_at desc;


-- ------------------------------------------------------------
-- 3. LES SIGNALEMENTS EN DÉTAIL
-- ------------------------------------------------------------
-- contact_email_enc est chiffré, ou vide si le chiffrement n'est pas
-- configuré. Pour le lire, voir chiffrement_email.sql, étape 4.

select id,
       created_at::date as le,
       structure_name,
       structure_city,
       error_type,
       correction,
       source_url,
       (contact_email_enc is not null) as adresse_fournie,
       status
from public.reports
order by created_at desc;


-- ------------------------------------------------------------
-- 4. MARQUER COMME TRAITÉ
-- ------------------------------------------------------------
-- Remplace les identifiants par les tiens. Les entrées traitées
-- disparaissent alors de la requête n° 1.

-- update public.suggestions set status = 'traite' where id in (1, 2, 3);
-- update public.reports     set status = 'traite' where id in (1, 2);

-- Pour écarter sans donner suite (hors sujet, doublon, plaisanterie) :
-- update public.suggestions set status = 'ecarte' where id in (4);


-- ------------------------------------------------------------
-- 5. COMBIEN, ET DEPUIS QUAND
-- ------------------------------------------------------------

select 'propositions' as table_, status, count(*), max(created_at)::date as derniere
from public.suggestions group by status
union all
select 'signalements', status, count(*), max(created_at)::date
from public.reports group by status
order by table_, status;


-- ------------------------------------------------------------
-- 6. LES VOTES — le classement réel
-- ------------------------------------------------------------
-- Le podium du site n'affiche que les trois premiers. Voici tout,
-- limité aux fiches ayant reçu au moins trois votes.

select a.name,
       a.city,
       r.rating as note,
       r.votes  as nb_votes
from public.rating_summary r
join public.ainventions a using (slug)
where r.votes >= 3
order by r.rating desc, r.votes desc
limit 50;


-- ------------------------------------------------------------
-- 7. HYGIÈNE
-- ------------------------------------------------------------
-- Efface les signalements de plus de six mois. Moins on garde,
-- moins on expose. Automatisable, voir chiffrement_email.sql.

-- select public.purge_old_reports();
