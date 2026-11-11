# BookSwap — site d'achat, de vente et d'échange de livres

Application web complète : catalogue public, espace membre, panneau d'administration.
Base de données partagée et authentification via **Supabase**, hébergement via **Vercel**.

## Publier en 4 points

1. Créer un projet sur [supabase.com](https://supabase.com).
2. Exécuter `supabase-schema.sql` dans **SQL Editor**.
3. Renseigner `SUPABASE_URL` et `SUPABASE_ANON_KEY` dans `config.js`.
4. Pousser le dépôt sur GitHub puis l'importer sur [vercel.com](https://vercel.com).

Raccourci pour l'envoi sur GitHub :

```bash
bash publier.sh https://github.com/VOTRE-COMPTE/bookswap.git    # Linux / macOS
publier.bat https://github.com/VOTRE-COMPTE/bookswap.git        # Windows
```

## Mise à jour v3 — site déjà publié

Identique à la v2 : collez **tout** `supabase-schema.sql` dans **SQL Editor** → **Run**
(le script met à niveau une base v1 ou v2, sans effacer de données), puis remplacez sur
GitHub `supabase-schema.sql`, `api.js`, `style.css`, `index.html`, `membre.html`,
`administrateur.html`, `README.md` et ajoutez `CORRESPONDANCE-RAPPORT.md`.

### Nouveautés v3 (alignement sur le rapport de projet)

| Rapport | Dans le site |
|---|---|
| Gestion des favoris | ♡ sur chaque livre du catalogue, page **Mes Favoris** dans l'espace membre |
| Filtrage avancé : genre, état, zone géographique | filtres **Catégorie**, **Type**, **État**, **Ville** dans le catalogue |
| Marquer un livre « vendu » ou « réservé » | boutons **Réserver** / **Remettre en vente** / **Marquer vendu** ; ruban « Réservé » dans le catalogue |
| Système de notation | à la vente, le vendeur désigne l'acheteur ; l'acheteur note le vendeur (1-5 ★ + commentaire) ; la réputation s'affiche dans la fiche du livre |
| Photo de profil | **Paramètres du profil → Changer la photo** |
| Notifications | toast + compteur dans l'onglet à l'arrivée d'un message (temps réel Supabase) |
| Cas d'utilisation « Promouvoir en modérateur » | bouton dans **Gérer les utilisateurs** ; le co-administrateur s'appelle désormais **Modérateur** |

Détail de chaque cas d'utilisation : voir `CORRESPONDANCE-RAPPORT.md`.

## Mise à jour v2 — site déjà publié

1. Supabase → **SQL Editor** → collez **tout** `supabase-schema.sql` → **Run**.
   Le script est ré-exécutable : il ajoute les colonnes, le stockage des images
   et les protections, sans effacer aucune donnée.
2. Remplacez sur GitHub : `supabase-schema.sql`, `api.js`, `style.css`,
   `index.html`, `membre.html`, `administrateur.html`, `README.md`.
   Vercel redéploie tout seul.
3. Si plusieurs administrateurs existaient déjà : le **plus ancien** devient
   administrateur principal, les autres deviennent co-administrateurs.
   Au-delà de la limite (1), le principal retire les rôles en trop depuis
   **Administrateurs**.

### Nouveautés

- **Photos des livres** : 1 image principale + 3 autres par annonce. Ajout par clic
  ou glisser-déposer, ★ pour choisir la principale, ✕ pour retirer. Les photos sont
  réduites (1600 px, JPEG) dans le navigateur avant l'envoi, puis rangées dans le
  bucket Supabase Storage `livres` (créé par le script). La principale sert de
  couverture dans le catalogue ; la fiche détaillée affiche la galerie.
- **Modifier après publication** : le propriétaire voit « Modifier mon annonce »
  directement dans la fiche du catalogue ; textes, prix et photos se changent à tout
  moment et la fiche affiche « Modifiée le … ».
- **Un seul administrateur principal** + **un co-administrateur** (voir « Rôles et droits »).

## Fichiers

### Pages

| Fichier | Rôle |
|---|---|
| `index.html` | Catalogue public : consulter, rechercher, voir détails, signaler, s'inscrire, se connecter |
| `connexion.html` | Authentification + demande de réinitialisation du mot de passe |
| `inscription.html` | Création d'un compte membre |
| `reinitialisation.html` | Cible du lien e-mail : choix d'un nouveau mot de passe |
| `membre.html` | Espace membre : annonces, échanges, historique, messagerie, profil |
| `administrateur.html` | Administration : utilisateurs, annonces, signalements, messages, catégories |
| `404.html` | Page d'erreur (servie automatiquement par Vercel) |

### Code et configuration

| Fichier | Rôle |
|---|---|
| `style.css` | Feuille de style commune |
| `api.js` | Couche d'accès aux données Supabase (objet global `BS`) |
| `config.js` | **Les deux clés à renseigner** |
| `config.example.js` | Modèle de configuration (à copier si besoin) |
| `supabase-schema.sql` | Tables, politiques RLS, triggers et fonctions |
| `vercel.json` | En-têtes de sécurité, cache, `noindex` sur les espaces privés |

### Publication et référencement

| Fichier | Rôle |
|---|---|
| `favicon.svg` | Icône du site |
| `manifest.webmanifest` | Installation sur mobile (écran d'accueil) |
| `robots.txt` | Espaces privés exclus des moteurs de recherche |
| `sitemap.xml` | Plan du site — **remplacez le domaine** |
| `publier.sh` / `publier.bat` | Envoi du code sur GitHub en une commande |
| `.gitignore`, `.gitattributes`, `LICENSE` | Réglages du dépôt et licence MIT |

> Après le premier déploiement, remplacez `VOTRE-SITE.vercel.app` dans
> `robots.txt` et `sitemap.xml` par votre adresse réelle.

## Premier administrateur (= administrateur principal)

Aucune manipulation SQL n'est nécessaire :

1. Créez votre compte depuis la page d'inscription du site.
2. Connectez-vous, ouvrez **Paramètres du Profil**.
3. Cliquez sur **Prendre le rôle d'administrateur** — le bouton n'apparaît que
   tant qu'aucun administrateur n'existe, et disparaît définitivement ensuite.

Vous êtes alors l'**administrateur principal**, unique. Pour qu'une autre personne
gère le site avec vous : panneau d'administration → **Administrateurs** →
**Nommer un co-administrateur**. Depuis la même page vous pouvez lui retirer ce rôle
ou lui **transférer le rôle principal** (vous devenez alors co-administrateur).

Le nombre de co-administrateurs est limité à **1** ; pour changer cette limite,
modifiez la fonction `max_coadministrateurs` dans `supabase-schema.sql` et relancez-le.

## Sessions

La session vit le temps de l'onglet (`sessionStorage`) : fermer le navigateur
déconnecte. Les espaces membre et administrateur ne sont jamais ouverts
automatiquement — l'accès passe toujours par la page de connexion.

## Temps réel (facultatif)

Le catalogue public se rafraîchit tout seul si vous activez Realtime sur la table
`annonces` : Supabase → **Database** → **Replication** → cocher `annonces`.
Sans cette activation, le site fonctionne normalement, le rafraîchissement se fait
au chargement de la page.

## Rôles et droits

- **Visiteur** — consulter le catalogue, rechercher (titre, auteur, ISBN, catégorie, type),
  voir les détails, signaler une annonce, s'inscrire.
- **Membre** — publier / modifier / supprimer ses annonces, conclure une transaction,
  contacter un vendeur, messagerie, historique, profil et mot de passe.
- **Co-administrateur** — tout ce qui précède, plus : gérer les membres (statut,
  crédits, bannissement, suppression), modérer toutes les annonces (photos comprises),
  traiter les signalements, superviser les messages, gérer les catégories.
  Il ne peut pas modifier, bannir ou supprimer le compte d'un autre administrateur.
- **Administrateur principal** (un seul) — tout ce que fait le co-administrateur, plus :
  nommer / retirer le co-administrateur et transférer son propre rôle.

La séparation des droits est appliquée côté serveur (politiques RLS, triggers et fonctions
PostgreSQL) : elle ne dépend pas du code JavaScript de la page. Un membre ne peut ni changer
son rôle, ni ses crédits, ni le statut, les vues ou le vendeur de ses annonces.

## Sécurité

- Mots de passe gérés par Supabase Auth (bcrypt), jamais stockés par l'application.
- Clé `anon` publique + RLS : un membre ne peut pas lire les données d'un autre.
- Aucune connexion automatique : l'inscription n'ouvre pas de session.
- Échappement HTML systématique des contenus saisis par les utilisateurs.
- Bouton afficher / masquer sur chaque champ de mot de passe.
- Ne jamais placer la clé `service_role` dans ces fichiers.

## Version locale sans serveur

Une variante fonctionnant hors ligne (données dans le navigateur, sans Supabase)
est disponible dans le dossier parent : `index.html`, `visiteur.html`, `membre.html`,
`administrateur.html`, `connexion.html`, `inscription.html`.
