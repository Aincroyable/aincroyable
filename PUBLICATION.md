# Mettre le site en ligne sur www.aincroyable.fr

Tout est déjà renseigné pour cette adresse : canonical, `og:url`, images de partage
en absolu, `sitemap.xml`, `robots.txt`, et le fichier `CNAME`. Rien à modifier.

L'ordre compte : Supabase **avant** GitHub, pour que `config.js` parte déjà rempli
et t'éviter un second envoi.

---

## 1. Supabase — la base qui reçoit votes et propositions

Sans cette étape le site fonctionne, mais chaque visiteur ne voit que ses propres
notes, et **les propositions de nouvelles structures ne te parviennent pas**
(voir la section « Où arrivent les propositions » plus bas).

1. **supabase.com** → *Start your project* → connexion possible avec GitHub.
2. *New project* : nom `aincroyable`, région **Central EU (Frankfurt)** ou
   **West EU (Ireland)**. Le mot de passe de base de données s'affiche une seule
   fois — range-le dans ton gestionnaire de mots de passe.
3. *SQL Editor* → *New query* → coller tout `supabase.sql` → **Run**.
4. Nouvelle requête → coller tout `seed_ainventions.sql` → **Run**. 405 fiches.
5. *Project Settings → API* : copier **Project URL** et la clé **`anon` `public`**.
6. Les inscrire dans `config.js` :

```js
window.AINCROYABLE_CONFIG = {
  supabaseUrl: "https://xxxxxxxx.supabase.co",
  supabaseAnonKey: "eyJhbGci...",
  reportEmail: ""
};
```

⚠️ **La clé `anon`, jamais la clé `service_role`.** Cette dernière contourne toutes
les protections et ne doit jamais se trouver dans du code envoyé au navigateur.

La politique de sécurité du contenu autorise déjà `*.supabase.co`, rien à changer.

## 2. Le dépôt GitHub

Créer un dépôt, y déposer **tout le contenu de ce dossier** — y compris les fichiers
cachés `.nojekyll` et `CNAME` — puis :

*Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)`*

Le champ **Custom domain** doit indiquer `www.aincroyable.fr`. GitHub écrit alors
lui-même le fichier `CNAME` ; celui que j'ai préparé fait la même chose, ils ne se
contredisent pas.

Les fichiers `.sql` et `.md` déposés à côté ne sont pas servis comme des pages : ils
restent dans le dépôt, visibles seulement si quelqu'un va les y chercher. Si tu
préfères les garder pour toi, retire-les avant l'envoi — le site fonctionne sans eux.

## 3. Le DNS

Chez ton registrar, pour le domaine `aincroyable.fr` :

| Type | Nom | Valeur |
|---|---|---|
| CNAME | `www` | `TONPSEUDO.github.io` |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |

Le `CNAME` sur `www` est l'essentiel : c'est l'adresse canonique du site. Les quatre
`A` sur le domaine nu font que `aincroyable.fr` sans `www` mène aussi au site plutôt
que de tomber dans le vide.

**Supprime d'abord les enregistrements qui pointent vers Heroku**, sinon les deux se
disputent le domaine.

La propagation prend de quelques minutes à quelques heures.

## 4. HTTPS

Une fois le DNS propagé, retourner dans *Settings → Pages* et cocher **Enforce HTTPS**.
L'option peut mettre jusqu'à 24 heures à devenir disponible, le temps que GitHub émette
le certificat. Ne pas diffuser l'adresse avant : sans HTTPS, les navigateurs affichent
un avertissement.

## 5. Vérifier avant d'annoncer

- La carte s'affiche avec ses marqueurs.
- Un vote fait bouger la moyenne ; un second vote depuis le **même navigateur** la
  corrige sans incrémenter le compteur.
- Depuis un autre appareil, la moyenne du premier vote est bien visible — c'est ce qui
  prouve que Supabase est branché.
- Envoyer une proposition de test, puis la retrouver dans la table `suggestions`.
- Coller l'adresse dans une conversation WhatsApp ou LinkedIn : l'aperçu doit montrer
  l'image, le titre et la description.
- Une adresse inexistante affiche la page 404 maison.

## 6. Search Console

*search.google.com/search-console* → **Ajouter une propriété → Domaine** →
`aincroyable.fr` → validation par enregistrement DNS TXT.

Puis : envoyer `https://www.aincroyable.fr/sitemap.xml`, inspecter la page d'accueil,
demander l'indexation.

Un site neuf met **des semaines** à se positionner, parfois des mois. C'est normal et
personne ne peut l'accélérer.

---

## Où arrivent les propositions des visiteurs

**Rien ne t'est envoyé par e-mail. Tout se lit dans Supabase.** Deux tables :

| Table | Ce qu'elle reçoit | Formulaire |
|---|---|---|
| `suggestions` | nom ainventif, commune, lien | « Proposer un nom » |
| `reports` | correction sur une fiche existante | « Signaler une erreur » |

### Les lire

*Table Editor* → table `suggestions`. Ou, plus commode, *SQL Editor* avec les requêtes
prêtes de **`boite_de_reception.sql`** : les nouveautés d'abord, marquage de ce qui est
traité, comptage.

Les deux tables sont **fermées à la clé publique du site** : le navigateur ne peut
qu'appeler les fonctions d'écriture, jamais lire ce que d'autres ont envoyé. Toi, tu y
accèdes par le tableau de bord Supabase, qui utilise un rôle privilégié.

### Être prévenu

Supabase n'envoie pas de notification par défaut. Trois façons de faire, de la plus
simple à la plus automatique :

1. **Regarder de temps en temps.** Pour un site qui démarre, c'est suffisant et
   ça ne coûte rien.
2. **Un signet vers la requête** de `boite_de_reception.sql` dans l'éditeur SQL.
3. **Database Webhooks** (*Database → Webhooks*) : à chaque insertion, Supabase appelle
   une adresse de ton choix — un webhook Discord ou Slack marche sans écrire une ligne
   de code. Pour un e-mail il faut un service d'envoi en plus.

### Sans Supabase

Si tu publies sans faire l'étape 1, le formulaire **copie la proposition dans le
presse-papiers du visiteur** et lui demande de te l'envoyer lui-même. Autant dire que
tu n'en recevras presque aucune. C'est un filet de sécurité, pas une solution.

### Les e-mails de contact

Le formulaire de signalement propose un champ e-mail facultatif. **Par défaut il n'est
pas conservé** : faute de clé de chiffrement, la fonction l'écarte et le signalement
reste anonyme. Si tu veux pouvoir répondre, joue `chiffrement_email.sql` — l'adresse
sera alors chiffrée avant écriture, illisible même pour Supabase, et seule ta clé privée
la déchiffre. Détails dans `VOTES-INSTALLATION.md`.

---

## Ce qui reste de l'ancien site

Les anciennes adresses `/infos`, `/nom` et `/quiz` **n'existent plus** : le site est
désormais une page unique, elles afficheront la page 404, qui renvoie au recensement.
Le peu de référencement qu'elles avaient acquis est perdu — c'était le prix de la
simplification. Si tu changes d'avis, un dossier contenant un `index.html` de trois
lignes suffit à rétablir chaque redirection.

**L'application Heroku peut être arrêtée** une fois le DNS basculé et le site vérifié.
Garde le dépôt du code : le quiz et l'espace sémantique y restent, si tu veux les
remettre en ligne un jour.

---

## Et pour avoir du trafic

Le référencement technique te rend indexable, pas visible. Ce qui fait venir les gens,
ce sont les liens entrants — et tu n'en as encore aucun.

**Le jeu de données sur data.gouv.fr.** Celui de tif.hair a été téléchargé 5 000 fois
et renvoie vers leur site. Un lien depuis un domaine en `.gouv.fr` pèse plus lourd que
des dizaines de pages. Et ton jeu de données est mieux documenté que le leur : statuts
vérifiés au registre, dates de cessation, sources tracées.

**La presse locale.** Le Progrès, La Voix de l'Ain, France Bleu Pays de Savoie. Un
projet sur le département, fait par quelqu'un du département, avec un chiffre qui fait
un titre : **une entreprise de l'Ain sur 180 a glissé le nom de son département dans
le sien** (289 structures actives recensées sur 51 976 établissements, INSEE 2022).

**L'angle éditorial.** L'Ain est probablement le seul département français dont le nom
soit un phonème aussi productif. Et les familles de calembours se comptent :
22 fiches en *Ainter-*, 21 en *-main*, 17 en *Jard'Ain*, 15 en *Ain'stant*, 10 en
*-pain*. Que dix-sept jardiniers aient eu la même idée chacun de leur côté, c'est
le genre de détail qui circule.
