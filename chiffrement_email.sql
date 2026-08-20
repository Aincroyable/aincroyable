-- ============================================================
-- Chiffrement des adresses e-mail des signalements — OPTIONNEL
-- ============================================================
--
-- Sans ce fichier, le site fonctionne déjà de façon sûre : faute de clé
-- publique, la fonction submit_report() écarte purement et simplement
-- l'adresse e-mail. Les signalements sont alors anonymes, et il n'y a
-- rien à protéger.
--
-- Joue ce fichier seulement si tu veux pouvoir RÉPONDRE aux gens qui
-- signalent une erreur. L'adresse sera alors conservée, mais chiffrée :
-- illisible pour quiconque accède à la base, y compris Supabase.
--
-- ⚠️ Si tu perds ta clé privée, les adresses sont définitivement
--    irrécupérables. C'est le principe même du chiffrement.
-- ============================================================


-- ------------------------------------------------------------
-- ÉTAPE 1 — Fabriquer une paire de clés, SUR TON ORDINATEUR
-- ------------------------------------------------------------
-- Sous Windows, installer Gpg4win ; GPG est déjà là sur macOS et Linux.
--
-- ⚠️ DEUX PIÈGES, vérifiés en conditions réelles :
--
--   1. pgcrypto ne sait pas lire les clés à courbe elliptique
--      (ed25519 / curve25519), qui sont pourtant le choix par défaut
--      de GnuPG depuis la version 2.3. **Il faut forcer RSA.**
--
--   2. pgcrypto exige une SOUS-CLÉ de chiffrement. Une clé principale
--      qui sait chiffrer ne suffit pas : le message d'erreur est alors
--      « No encryption key found ».
--
-- La voie la plus sûre, interactive :
--
--     gpg --full-generate-key
--
--     → type de clé      : 1 (RSA et RSA)   ← surtout pas ECC
--     → taille           : 4096
--     → expiration       : 0 (jamais)
--     → nom              : Aincroyable
--     → adresse          : ton@email.fr
--     → phrase de passe  : solide, notée dans ton gestionnaire
--
-- « RSA et RSA » crée exactement ce qu'il faut : une clé principale de
-- signature et une sous-clé de chiffrement.
--
-- En deux commandes si tu préfères :
--
--     gpg --quick-generate-key "Aincroyable <ton@email.fr>" rsa4096 sign never
--     gpg --list-keys --with-colons           (relever l'empreinte, ligne fpr)
--     gpg --quick-add-key <EMPREINTE> rsa4096 encrypt never
--
-- VÉRIFIER AVANT D'ALLER PLUS LOIN :
--
--     gpg --list-keys --with-colons
--
-- Il doit y avoir DEUX lignes, une « pub » et une « sub », et la sous-clé
-- doit porter la capacité « e » :
--
--     pub:...:scESC:...      ← clé principale
--     sub:...:e:...          ← sous-clé de chiffrement, indispensable
--
-- S'il n'y a pas de ligne « sub », recommence : le chiffrement échouera.
--
-- Exporter la clé PUBLIQUE, la seule qui ira dans la base :
--
--     gpg --armor --export "Aincroyable" > aincroyable_public.asc
--
-- Sauvegarder la clé PRIVÉE, à garder hors de la base et hors du dépôt
-- GitHub — un gestionnaire de mots de passe convient bien :
--
--     gpg --armor --export-secret-keys "Aincroyable" > aincroyable_prive.asc
--
-- ⚠️ aincroyable_prive.asc ne doit JAMAIS être commité ni collé dans
--    Supabase. C'est lui qui déchiffre.


-- ------------------------------------------------------------
-- ÉTAPE 2 — Déposer la clé publique dans la base
-- ------------------------------------------------------------
-- Colle ci-dessous le contenu intégral de aincroyable_public.asc,
-- lignes BEGIN et END comprises, puis exécute.

insert into private.settings (key, value) values (
  'report_pubkey',
$KEY$
-----BEGIN PGP PUBLIC KEY BLOCK-----

REMPLACER PAR TA CLÉ PUBLIQUE

-----END PGP PUBLIC KEY BLOCK-----
$KEY$
)
on conflict (key) do update set value = excluded.value;

-- Le schéma « private » n'est pas exposé par l'API : la clé publique
-- n'est de toute façon pas un secret, mais autant ne pas l'exposer.
revoke all on schema private from anon, authenticated;


-- ------------------------------------------------------------
-- ÉTAPE 3 — Vérifier que ça chiffre
-- ------------------------------------------------------------
select public.submit_report(
  'test', 'Test', 'Bourg-en-Bresse',
  'Autre', 'Ceci est un test de chiffrement.', null, 'test@exemple.fr'
);

-- La colonne doit contenir des octets illisibles, pas l'adresse.
-- Attendu : « chiffre » à t, et quelques centaines d'octets.
select id,
       created_at,
       (contact_email_enc is not null) as chiffre,
       length(contact_email_enc)       as octets,
       left(encode(contact_email_enc,'hex'), 32) as apercu_brut
from public.reports
order by id desc limit 1;

-- Si « chiffre » vaut f, la clé n'a pas été prise en compte : reviens
-- à l'étape 1 et vérifie la présence de la sous-clé « sub:...:e: ».
-- Si l'appel échoue sur « No encryption key found », c'est le même
-- problème : clé sans sous-clé de chiffrement, ou clé à courbe elliptique.


-- ------------------------------------------------------------
-- ÉTAPE 4 — Lire les adresses, quand tu en as besoin
-- ------------------------------------------------------------
-- À exécuter dans l'éditeur SQL, en collant temporairement ta clé
-- privée. Ne l'enregistre nulle part dans la base : ferme l'onglet
-- après usage.

/*
select id,
       created_at,
       structure_name,
       error_type,
       correction,
       extensions.pgp_pub_decrypt(
         contact_email_enc,
         extensions.dearmor($PRIV$
-----BEGIN PGP PRIVATE KEY BLOCK-----
COLLER ICI TEMPORAIREMENT
-----END PGP PRIVATE KEY BLOCK-----
$PRIV$),
         'ta-phrase-de-passe'
       ) as email
from public.reports
where contact_email_enc is not null
order by created_at desc;
*/

-- Le troisième argument est la phrase de passe de ta clé privée.
-- Si elle n'en a pas, retire-le.


-- ------------------------------------------------------------
-- ÉTAPE 5 — Purger régulièrement
-- ------------------------------------------------------------
-- Moins on garde, moins on expose. À lancer de temps en temps :
--
--     select public.purge_old_reports();
--
-- Cette fonction efface les signalements de plus de six mois.
-- Pour l'automatiser, activer l'extension pg_cron dans Supabase
-- (Database → Extensions) puis :
--
--     select cron.schedule('purge-reports', '0 4 1 * *',
--                          $$select public.purge_old_reports()$$);
--
-- soit le 1er de chaque mois à 4 h.
