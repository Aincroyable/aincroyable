# Audit avant mise en ligne — 20 août 2026

Revue de sécurité et de cohérence du dossier. Je ne suis pas auditeur professionnel :
ceci couvre les défauts courants d'un site statique public, pas une revue exhaustive.

## Corrigé pendant l'audit

### 1. Versions de fichiers périmées — le plus concret

`index.html` déclarait `app.js?v=33` et `styles.css?v=31b`, alors que les deux
fichiers ont été largement réécrits. Ce paramètre sert à forcer le rechargement :
tant qu'il ne bouge pas, les navigateurs resservent leur copie en cache.

Concrètement, tes visiteurs de retour auraient chargé **l'ancien `app.js`, donc un
site sans le vote**, et l'ancien CSS. Tout est passé en `v=41`.

### 2. Dépendance à un CDN supprimée

Leaflet était chargé depuis `unpkg.com`. Une compromission de ce service — ou une
simple panne — aurait exécuté du code arbitraire sur ton site, ou cassé la carte.

Leaflet 1.9.4 est maintenant servi depuis `vendor/leaflet/`. Les fichiers viennent
du paquet npm officiel, et j'ai vérifié que leurs empreintes SHA-256 correspondent
exactement à celles qui étaient déclarées pour unpkg :

```
leaflet.js   20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=
leaflet.css  p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=
```

Plus aucun script tiers n'est chargé. Ne restent que les tuiles OpenStreetMap et,
si le vote partagé est activé, Supabase. Les appels à `geo.api.gouv.fr` et
`data.gouv.fr` ont été supprimés : les 401 fiches portent désormais leur commune
officielle et leurs coordonnées, plus rien n'est à résoudre au chargement.

### 3. Politique de sécurité du contenu

Il n'y en avait aucune. Une CSP est maintenant déclarée : le code ne peut venir que
du site lui-même, les images que du site et d'OpenStreetMap, les requêtes que de
Supabase seul. Les balises `<object>` sont interdites, `base-uri` est
verrouillé.

Elle a été testée dans un navigateur réel : **aucune violation, carte fonctionnelle,
401 marqueurs**. Au premier essai la carte restait blanche — `*.tile.openstreetmap.org`
ne couvre pas `tile.openstreetmap.org` sans sous-domaine. C'est corrigé, mais ça montre
qu'une CSP se teste plutôt qu'elle ne se devine.

Une réserve : `frame-ancestors`, qui empêche l'inclusion du site dans une iframe
tierce, n'a pas été retenue. Cette directive est ignorée dans une balise `<meta>` et
exige un en-tête HTTP, que GitHub Pages ne permet pas de définir. Un hébergeur comme
Netlify ou Cloudflare Pages le permettrait.

### 4. Liens externes assainis

Les adresses des fiches étaient insérées telles quelles dans un attribut `href`.
Aucune n'est dangereuse aujourd'hui — j'ai vérifié les 289 — mais une fiche ajoutée
plus tard avec une adresse en `javascript:` aurait suffi à exécuter du code.
Une fonction n'accepte désormais que `http` et `https`, et le lien est omis sinon.
`rel="noopener noreferrer"` est en place sur les liens en nouvel onglet.

Deux liens en `http://` sont passés en `https://` après vérification que les sites
répondent bien en chiffré. Le troisième, `ainterrepole01.com`, **échoue son handshake
TLS** : il reste en `http://`. À toi de voir si tu préfères le retirer.

### 5. Mention de confidentialité

Le site collectait des données sans le dire : identifiant de vote, contenu des
signalements, e-mail facultatif, et les adresses IP dans les journaux de l'hébergeur
et de Supabase. Une section « Ce que ce site enregistre sur vous » a été ajoutée dans
*Données et corrections*.

### 6. Notes de démonstration purgées

15 fiches portaient de fausses notes, jusqu'à 319 votes. Elles auraient gelé le podium
sur des données inventées. Toutes remises à zéro.

## Vérifié et sain

- **Échappement HTML** : `escapeHTML` traite bien `& < > " '`, et il est appliqué sur
  tous les champs affichés — nom, commune, description, statut.
- **Paramètre `?nom=`** : la valeur n'est jamais insérée dans la page, elle sert
  uniquement à chercher une correspondance exacte dans le catalogue.
- **Aucun `eval`, `new Function` ni `document.write`.**
- **`config.js` ne contient aucun secret** — il est vide, à renseigner.
- **Cohérence des données** : `data.js` et `seed_ainventions.sql` contiennent les
  mêmes 401 fiches, sans écart.
- **Écriture en base** : le navigateur ne peut appeler qu'une fonction, `cast_vote()`.
  La table des votes est fermée en lecture comme en écriture. Les signalements ne sont
  lisibles que par toi.

## À faire avant de publier

L'adresse `https://www.aincroyable.fr` est désormais inscrite partout : canonical,
`og:url`, images de partage en absolu, `sitemap.xml`, `robots.txt`, `CNAME`.
Les anciennes routes `/infos`, `/nom` et `/quiz` sont redirigées.

Reste **Supabase** : jouer `supabase.sql` puis `seed_ainventions.sql`, et renseigner
`config.js` avec la clé `anon`. La CSP autorise déjà `*.supabase.co`.

La marche à suivre complète est dans `PUBLICATION.md`.

## Ce que je n'ai pas pu vérifier

- **La validité des 289 liens externes.** J'ai contrôlé leur forme et leur protocole,
  pas qu'ils répondent tous. Un lien mort n'est pas un risque de sécurité, mais ça se
  vérifie avant lancement.
- **Le comportement réel avec ton Supabase.** Mes tests ont utilisé un serveur local
  qui imite l'API. Le schéma est cohérent, mais la première mise en service mérite un
  vote d'essai.
- **La clé anonyme Supabase sera publique**, c'est normal et prévu — mais uniquement
  parce que les règles d'accès la rendent inoffensive. Ne remplace jamais cette clé par
  la clé `service_role`, qui contourne toutes les protections.
