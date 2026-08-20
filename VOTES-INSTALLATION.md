# Activer le vote partagé — marche à suivre

## Faut-il s'inscrire quelque part ?

Oui. Un site statique ne peut rien mémoriser : sans base de données, chaque visiteur
ne verrait que ses propres notes. Il faut donc un service qui stocke les votes.

J'ai retenu **Supabase** parce que l'offre gratuite couvre très largement ce besoin,
qu'aucune carte bancaire n'est demandée, et que les serveurs peuvent être en Europe —
ce qui simplifie le sujet des données personnelles.

Une seule inscription, aucun autre service à créer.

---

## Les six étapes

### 1. Créer le compte et le projet
Sur **supabase.com** → *Start your project* → connexion possible avec GitHub.
Puis *New project* :

- **Name** : `aincroyable`
- **Database Password** : générée automatiquement — **note-la dans ton gestionnaire
  de mots de passe**, elle ne sera plus jamais affichée
- **Region** : `Central EU (Frankfurt)` ou `West EU (Ireland)`

La création prend une à deux minutes.

### 2. Créer les tables
*SQL Editor* → *New query* → coller tout `supabase.sql` → **Run**.

Ça crée le catalogue, la table des votes, la vue des moyennes, les tables des
signalements et des propositions, et les trois seules fonctions d'écriture :
`cast_vote()`, `submit_suggestion()`, `submit_report()`.

### 3. Remplir le catalogue
Nouvelle requête → coller tout `seed_ainventions.sql` → **Run**. 401 fiches insérées.

Ce fichier est relançable : après chaque mise à jour de `data.js`, régénère-le et
rejoue-le, les fiches existantes sont mises à jour sans doublon.

### 4. Récupérer les identifiants
*Project Settings → API* :

- **Project URL** → `https://xxxxxxxx.supabase.co`
- **Project API keys** → la clé **`anon` `public`**

⚠️ **Jamais la clé `service_role`.** Celle-là contourne toutes les protections. Elle
ne doit apparaître nulle part dans le code envoyé au navigateur.

### 5. Renseigner `config.js`

```js
window.AINCROYABLE_CONFIG = {
  supabaseUrl: "https://xxxxxxxx.supabase.co",
  supabaseAnonKey: "eyJhbGci...",
  reportEmail: ""
};
```

Pousser le fichier sur GitHub. La politique de sécurité du contenu autorise déjà
`*.supabase.co`, rien d'autre à modifier.

### 6. Essayer
Ouvrir le site, noter une fiche : la moyenne doit bouger. Recharger : la note tient.
Voter une seconde fois sur la même fiche : la moyenne change, **le nombre de votes
ne bouge pas**. Depuis un autre appareil, la note du premier vote doit être visible —
c'est ce qui prouve que Supabase est bien branché.

Envoyer une proposition de test, puis la retrouver dans la table `suggestions`.

---

## Relever ce que les visiteurs envoient

Rien n'arrive par e-mail : les tables `suggestions` et `reports` **sont** la boîte
de réception. Deux façons de les lire :

- *Table Editor* → `suggestions` ou `reports`
- *SQL Editor* → coller **`boite_de_reception.sql`**, qui contient les requêtes
  prêtes : les nouveautés, le détail avec repérage des doublons déjà au catalogue,
  le marquage de ce qui est traité, le classement complet des votes

Pour être prévenu sans y penser : *Database → Webhooks*, une insertion déclenche
un appel vers l'adresse de ton choix — un webhook Discord ou Slack suffit.

---

## Aucune donnée sensible en clair

### Ce qui est enregistré, et sous quelle forme

| Donnée | Forme | Lisible par qui |
|---|---|---|
| Note attribuée | entier de 0 à 5 | agrégée seulement, jamais à l'unité |
| Identifiant de votant | UUID tiré au hasard | personne — il ne désigne rien |
| Contenu d'un signalement | texte | toi seul |
| Adresse e-mail d'un signalement | **chiffrée, ou pas conservée** | toi seul, avec ta clé privée |
| Adresse IP | journaux de la plateforme | Supabase, temporairement |

### Ce que j'ai retiré

Le formulaire envoyait `navigator.userAgent`, l'empreinte du navigateur. Elle
n'apportait rien au traitement d'une correction et permettait de reconnaître un
visiteur. **Elle n'est plus collectée.**

### L'adresse e-mail

C'est la seule donnée réellement personnelle du système. Deux comportements :

**Par défaut, elle n'est pas conservée du tout.** Faute de clé publique configurée,
la fonction `submit_report()` l'écarte. Les signalements sont anonymes. C'est le
réglage le plus sûr, et il ne demande aucune action de ta part.

**Si tu veux pouvoir répondre**, joue `chiffrement_email.sql`. Tu fabriques une paire
de clés sur ton ordinateur, tu déposes la clé **publique** dans la base, et tu gardes
la clé **privée** chez toi. Attention à deux pièges vérifiés en conditions réelles :
pgcrypto refuse les clés à courbe elliptique — pourtant le défaut de GnuPG aujourd'hui —
et exige une sous-clé de chiffrement. Le fichier détaille la commande exacte. L'adresse est alors chiffrée avant écriture : elle est
illisible pour quiconque accède à la base — y compris Supabase, y compris en cas de
fuite. Seule ta clé privée la déchiffre.

⚠️ Perdre la clé privée rend les adresses définitivement irrécupérables. C'est le
principe même du chiffrement, pas un défaut.

### Les tables sont fermées

Ni la table des votes ni celle des signalements n'est accessible avec la clé publique
du site. Le navigateur ne peut appeler que deux fonctions, `cast_vote()` et
`submit_report()`, qui valident leurs entrées et n'écrivent que ce qu'il faut.
Seules les **moyennes** sont exposées en lecture, jamais les votes individuels.

### La clé publique dans le code, est-ce un problème ?

Non — mais seulement parce que les règles d'accès la rendent inoffensive. C'est le
modèle prévu par Supabase. Le fichier `supabase.sql` que tu avais au départ ne
respectait pas ce modèle : il autorisait `update ... using (true)` sur les votes,
c'est-à-dire sur n'importe quelle ligne. N'importe quel visiteur pouvait réécrire les
votes de tous les autres. C'est corrigé.

### Purge

`select public.purge_old_reports();` efface les signalements de plus de six mois.
Automatisable avec pg_cron, voir `chiffrement_email.sql`.

---

## Si Supabase tombe

Le site continue de fonctionner. La note du visiteur reste sur son appareil, un
message le prévient qu'elle n'a pas pu être transmise. Aucune page blanche.
