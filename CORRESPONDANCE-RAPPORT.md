# BookSwap — correspondance entre le rapport et le site (v3)

Ce document relie chaque élément du rapport *« BookSwap — Site web dédié à l'échange
et à la vente de livres »* (Mariam Mezni, 2025-2026) à son implémentation.
Il peut servir pour le chapitre III (Réalisation) et pour la soutenance.

## 1. Diagrammes de cas d'utilisation

### Visiteur (Figure 2)

| Cas d'utilisation | Relation | Où, dans le site | Côté serveur |
|---|---|---|---|
| Consulter les livres | — | `index.html` — catalogue | `annonces` (lecture publique, RLS) |
| Voir détails | «extend» Consulter | bouton **Voir détails** → fiche + galerie + réputation du vendeur | `incrementer_vues`, `avis_vendeur` |
| Signaler livre | «extend» Consulter | bouton **⚠** ou **Signaler** dans la fiche | `signaler_annonce` (sans compte) |
| Rechercher | — | barre de recherche + filtres catégorie / type / état / ville | `BS.catalogue()` |
| S'inscrire | — | `inscription.html`, onglet **Inscription** | Supabase Auth + trigger `creer_profil` |

### Membre (Figure 2 bis)

| Cas d'utilisation | Relation | Où, dans le site | Côté serveur |
|---|---|---|---|
| S'authentifier | «include» | `connexion.html` | Supabase Auth |
| Gérer les livres | — | **Mes Livres en Vente** | `annonces` (RLS : ses annonces) |
| Publier une annonce | — | **+ Publier une annonce** (1 photo principale + 3 autres) | `creerAnnonce`, Storage `livres` |
| Modifier annonce | «extend» Publier | **Modifier** (aussi depuis la fiche du catalogue) | trigger `proteger_annonce` (date « modifiée le ») |
| Supprimer annonce | «extend» Publier | **Supprimer** | photos effacées du stockage |
| Contacter vendeur | — | **Contacter le vendeur** dans la fiche | `messages` |
| *(rapport ch. I)* Réserver / marquer vendu | — | **Réserver**, **Remettre en vente**, **Marquer vendu** | `reserver_annonce`, `conclure_annonce` |
| *(rapport ch. I)* Favoris | — | ♡ dans le catalogue, **Mes Favoris** | table `favoris` |
| *(rapport ch. I)* Noter le vendeur | — | **Historique → Mes achats → ★ Noter le vendeur** | `noter_transaction`, table `evaluations` |
| *(rapport ch. I)* Gérer son profil (photo) | — | **Paramètres du profil** | `profiles.photo` |

### Administrateur (Figure 3)

| Cas d'utilisation | Relation | Où, dans le site | Côté serveur |
|---|---|---|---|
| Gérer les utilisateurs | — | **Gérer les utilisateurs** | RLS `profils_admin_*` |
| Bannir l'utilisateur | «extend» Gérer | bouton **Bannir / Réactiver** | `basculer_bannissement` |
| Promouvoir en modérateur | «extend» Gérer | bouton **🛡️ Promouvoir modérateur** (administrateur principal) | `nommer_coadministrateur` |
| Modérer les annonces | — | **Modérer les annonces**, **Signalements** | RLS `ann_*`, `signalements` |
| Supprimer une annonce | «extend» Modérer | bouton **Supprimer** | `supprimerAnnonce` |
| Archiver l'annonce | «extend» Modérer | bouton **Archiver / Republier** | statut `archivee` |

Un seul **administrateur principal** existe ; lui seul promeut ou retire le **modérateur**
(1 au maximum, réglable par `max_coadministrateurs`). Le modérateur a les mêmes outils de
modération mais ne peut pas toucher aux comptes des administrateurs.

## 2. Besoins fonctionnels (chapitre I)

| Besoin | État |
|---|---|
| Gestion du profil (nom, e-mail, photo) | ✅ nom, prénom, téléphone, ville, mot de passe, **photo** (l'e-mail sert d'identifiant et n'est pas modifiable) |
| Messagerie interne sans divulguer le téléphone | ✅ messages + réponses dans l'espace membre |
| Gestion des favoris | ✅ v3 |
| Filtrage avancé : genre, état, zone géographique | ✅ v3 |
| Notifications (nouveau message) | ✅ v3 : toast + compteur, en temps réel |
| Marquer « vendu » ou « réservé » | ✅ v3 |
| Système de notation (solution proposée) | ✅ v3 : note 1-5 ★ de l'acheteur, réputation = moyenne |

## 3. Diagramme de classes → tables

| Classe | Table / colonnes |
|---|---|
| Utilisateur (id, nom, prénom, email, rôle) | `profiles` (+ `auth.users` pour l'e-mail et le mot de passe) |
| Membre (adresse, téléphone, réputation) | `profiles.adresse`, `telephone`, `reputation` |
| Administrateur (niveau_acces) | `profiles.niveau_acces` : 2 = principal, 1 = modérateur |
| Annonce + Livre | `annonces` (les attributs du livre sont dans l'annonce) |
| Catégorie | `categories` |
| Message | `messages` |
| Signalement (motif, date) | `signalements` |
| *(v3)* Favori, Évaluation, Transaction | `favoris`, `evaluations`, `transactions` |

## 4. Remarques sur les diagrammes du rapport (à corriger avant la soutenance)

1. **S'inscrire et S'authentifier** — dans le site, les trois acteurs (Visiteur, Membre,
   Administrateur) s'inscrivent et se connectent par les mêmes pages ; après connexion, le
   système les oriente selon leur rôle. Dans les figures 1 et 2, *Consulter*, *Rechercher* et
   *S'inscrire* incluent *S'authentifier* : c'est à corriger. Ces deux cas sont déclenchés par
   les acteurs eux-mêmes (simple trait d'association), et l'«include» S'authentifier ne reste
   que sur les actions protégées : *Publier*, *Contacter*, *Gérer les livres*,
   *Gérer les utilisateurs*, *Modérer les annonces*.
2. **Acteur « Utilisateur »** — pour alléger le diagramme, ajouter un acteur abstrait
   *Utilisateur* relié à *S'inscrire* et *S'authentifier* ; *Visiteur*, *Membre* et
   *Administrateur* en héritent (flèche à triangle creux vers *Utilisateur*). C'est cohérent
   avec le diagramme de classes, où `Utilisateur` porte `sInscrire()` et `seConnecter()`.
3. **Cas manquants** — les besoins du chapitre I (favoris, réserver / marquer vendu,
   noter le vendeur, notifications) et *Traiter les signalements* chez l'administrateur
   (présent dans le diagramme de classes : `validerSignalement`) n'apparaissent pas.
4. **Modifier / Supprimer annonce** — sémantiquement, ce sont des extensions de
   *Gérer les livres* (ou *Gérer ses annonces*) plutôt que de *Publier une annonce*.
5. **Texte** — dans les descriptions, « Relation <> » a perdu son stéréotype : écrire
   «include» et «extend». Fautes : « Visteur », « adminstrateur », « Gére » ; une flèche
   isolée traîne en bas de la figure 1 ; deux figures sont numérotées « Figure 2 ».
6. **Diagramme de classes** — les flèches d'héritage (triangle) entre *Annonce* et
   *Utilisateur*, *Message* et *Annonce*, *Signalement* et *Livre*, *Livre* et *Catégorie*
   devraient être des **associations** (une annonce n'*est* pas un utilisateur). La classe
   *Message* n'a ni attribut ni méthode (ajouter contenu, date, lu).
7. **Diagramme de séquence « Rechercher »** — il parle de *Prestataire* et de *missions* :
   il provient d'un autre projet. Remplacer par *Visiteur / Membre* et *livres*.
8. **Besoins non fonctionnels** — le rapport cite `password_hash` en PHP et MVC ; le site
   utilise **Supabase Auth** (mots de passe hachés avec bcrypt), **PostgreSQL + RLS** pour la
   sécurité et une architecture **client (HTML/JS) + BaaS**. Adapter le texte pour qu'il
   corresponde à la réalisation.
