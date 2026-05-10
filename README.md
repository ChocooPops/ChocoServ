# 🍫 ChocoPlus API - Backend NestJS

[![NestJS](https://img.shields.io/badge/NestJS-10.x-red.svg)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![MariaDB](https://img.shields.io/badge/MariaDB-10.x-blue.svg)](https://mariadb.org/)
[![JWT](https://img.shields.io/badge/JWT-Authentication-green.svg)](https://jwt.io/)

API REST complète pour l'application **ChocoPlus**, développée avec NestJS et TypeScript. Cette API gère l'authentification, la gestion des médias (films et séries), le streaming vidéo, les licences, les sélections, et bien plus encore.

## 📋 Table des matières

- [Vue d'ensemble](#-vue-densemble)
- [Architecture](#-architecture)
- [Base de données](#-base-de-données)
- [Authentification et sécurité](#-authentification-et-sécurité)
- [API Endpoints](#-api-endpoints)
- [Intégrations externes](#-intégrations-externes)
- [Configuration](#-configuration)
- [Installation](#-installation)
- [Structure du projet](#-structure-du-projet)
- [Technologies utilisées](#-technologies-utilisées)

## 🎯 Vue d'ensemble

L'API ChocoPlus est une API REST robuste qui sert de backend pour l'application desktop ChocoPlus. Elle offre :

- **Authentification JWT** avec système de vérification par email
- **Gestion complète des médias** (films, séries, saisons, épisodes)
- **Système de licences et sélections** pour organiser le contenu
- **Streaming vidéo sécurisé** avec authentification par token
- **Intégration et une lecture automatique des fichiers vidéos** pour la gestion de bibliothèque multimédia
- **Intégration TMDB** pour les métadonnées
- **Système de support** avec envoi d'emails
- **Gestion des utilisateurs** avec rôles et permissions
- **Graphiques et statistiques** pour les dashboards

## 🏗️ Architecture

L'API suit l'architecture modulaire de NestJS avec une structure en couches :

```
┌──────────────────────────────────────────────┐
│            Controllers Layer                 │
│   (Routes HTTP, Validation, Guards)          │
└──────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────┐
│             Services Layer                   │
│   (Business Logic, Data Processing)          │
└──────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────┐
│      Database Layer (MariaDB Pool)           │
│   Direct SQL queries via mariadb driver      │
│         MariaDB Database                     │
└──────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────┐
│          External Services                   │
│   - Node File System (médiathèqye)           │
│   - TMDB API                                 │
│   - Mail Service (SMTP)                      │
└──────────────────────────────────────────────┘
```

### Structure modulaire

Chaque module suit le pattern NestJS :
- **Module** : Configuration et injection de dépendances
- **Controller** : Gestion des routes HTTP et validation
- **Service** : Logique métier et accès aux données
- **DTO (Data Transfer Objects)** : Interfaces pour le typage TypeScript
- **Guards** : Protection des routes (authentification, rôles)

### Gestion de la base de données

L'API utilise le **driver natif MariaDB** (`mariadb` npm package) avec un **pool de connexions** pour des performances optimales :

- **Module global** `DatabaseModule` qui crée un pool de connexions réutilisable
- **Injection directe** du pool dans les services via `@Inject(DATABASE_POOL)`
- **Requêtes SQL natives** pour un contrôle total et des performances maximales
- **Gestion automatique** des connexions avec pool
- **Configuration** via variables d'environnement

**Exemple d'utilisation dans un service** :
```typescript
import { Injectable, Inject } from '@nestjs/common';
import { DATABASE_POOL } from '../database/database.module';
import { Pool } from 'mariadb';

@Injectable()
export class MovieService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async getMovieById(id: number): Promise<any> {
    const conn = await this.pool.getConnection();
    try {
      const rows = await conn.query(
        'SELECT * FROM Media WHERE id = ? AND mediaType = "MOVIE"',
        [id]
      );
      return rows[0];
    } finally {
      conn.release();
    }
  }
}
```

**Avantages de cette approche** :
- ✅ Performances optimales (pas de couche d'abstraction ORM)
- ✅ Contrôle total sur les requêtes SQL
- ✅ Flexibilité pour les requêtes complexes avec jointures
- ✅ Pool de connexions pour gérer la concurrence
- ✅ Typage TypeScript avec les interfaces DTO

---

## 🗄️ Base de données

La base de données MariaDB est le cœur du système ChocoPlus. Elle est organisée en **6 domaines fonctionnels** qui reflètent les grandes entités métier de l'application.

### Schéma général

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          DOMAINE UTILISATEURS                              │
│  Profil_Photo ←──── User ────→ User_Media_List                             │
│                        │                  │                                │
│                        └──────────────────┼──→ Stat_User                   │
└────────────────────────────────────────────┼───────────────────────────────┘
                                             │
┌────────────────────────────────────────────┼───────────────────────────────┐
│                          DOMAINE MÉDIAS    │                               │
│                                            ↓                               │
│  Poster ←──── Media (MOVIE | SERIES) ────→ Translation_Title               │
│    ↑              │                        │                               │
│    │              ├──→ Season ──→ Episode  │                               │
│    │              ├──→ Media_Credit        │                               │
│    │              ├──→ Media_Category      │                               │
│    │              ├──→ Media_Poster        │                               │
│    │              ├──→ Keyword             │                               │
│    │              └──→ Similar_Title       │                               │
└────┼───────────────────────────────────────────────────────────────────────┘
     │
┌────┼──────────────────────────────────────────────────────────────────────┐
│    │                   DOMAINE ORGANISATION                               │
│    ↓                                                                      │
│  License ────→ License_Media ────→ Media                                  │
│     └────────→ License_Selection ──→ Selection ──→ Selection_Media        │
│                                         └──────────→ Selection_Page       │
└───────────────────────────────────────────────────────────────────────────┘
     │
┌────┼──────────────────────────────────────────────────────────────────────┐
│    │                   DOMAINE ACTUALITÉS                                 │
│    ↓                                                                      │
│  News ────────────────────────────→ Media                                 │
│  News_Video_Running ──────────────→ Media                                 │
└───────────────────────────────────────────────────────────────────────────┘
```

---

### 👥 Domaine Utilisateurs

#### `Profil_Photo`
Stocke les avatars disponibles dans l'application.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | INT AUTO_INCREMENT | Identifiant unique |
| `name` | VARCHAR(255) UNIQUE | Nom du fichier image |
| `isDefaultPhoto` | BOOLEAN | `true` = photo fournie par défaut |
| `createdAt` / `updatedAt` | DATETIME(3) | Horodatages automatiques |

#### `User`
Table centrale des comptes utilisateurs. L'AUTO_INCREMENT commence à **70000** pour que les IDs soient facilement reconnaissables.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | INT (début 70000) | Identifiant unique |
| `pseudo` | VARCHAR(255) UNIQUE | Pseudonyme public |
| `email` | VARCHAR(255) UNIQUE | Email de connexion |
| `password` | VARCHAR(255) | Mot de passe hashé (bcrypt, 15 rounds) |
| `firstName` / `lastName` | VARCHAR(255) | Nom et prénom |
| `dateBorn` | DATE | Date de naissance |
| `role` | ENUM | `ADMIN`, `USER`, `FAMILY`, `NOT_ACTIVATE`, `SUSPENDED` |
| `profilPhoto` | INT (FK) | Référence vers `Profil_Photo` (nullable) |

**Contraintes** : `email` et `pseudo` sont uniques. La suppression d'une photo de profil met `profilPhoto` à NULL (`ON DELETE SET NULL`).

#### `User_Media_List`
Liste personnelle de favoris de chaque utilisateur (table de jointure Many-to-Many entre `User` et `Media`).

| Colonne | Type | Description |
|---------|------|-------------|
| `userId` | INT (FK) | Référence vers `User` |
| `mediaId` | INT (FK) | Référence vers `Media` |

**Contrainte** : La combinaison `(userId, mediaId)` est unique — un même média ne peut être ajouté qu'une fois dans la liste d'un utilisateur.

#### `Stat_User`
Suivi de la progression de visionnage de chaque utilisateur.

| Colonne | Type | Description |
|---------|------|-------------|
| `movieId` | INT (FK, nullable) | Film visionné (ou NULL si épisode) |
| `episodeId` | INT (FK, nullable) | Épisode visionné (ou NULL si film) |
| `userId` | INT (FK) | Utilisateur concerné |
| `state` | ENUM | `IN_PROGRESS` ou `FINISHED` |
| `watchProgress` | FLOAT(5,2) | Pourcentage de progression (ex: `73.45`) |

> Un enregistrement référence soit un film, soit un épisode — jamais les deux à la fois.

---

### 🎬 Domaine Médias

#### `Media`
Table centrale qui représente un **film** (`MOVIE`) ou une **série** (`SERIES`). L'AUTO_INCREMENT commence à **2 000 000** pour distinguer les IDs médias de ceux des autres entités.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | INT (début 2 000 000) | Identifiant unique |
| `title` | VARCHAR(255) UNIQUE | Titre principal (unique) |
| `mediaLibraryId` | VARCHAR(255) UNIQUE | ID de la médiathèque pour la synchronisation des meta-données du fichiers vidéos|
| `description` | VARCHAR(1024) | Synopsis (nullable) |
| `date` | DATE | Date de sortie |
| `time` | BIGINT UNSIGNED | Durée en millisecondes (nullable) |
| `quality` | VARCHAR(50) | Ex: `4K`, `1080p`, `720p` |
| `startShow` / `endShow` | VARCHAR(10) | Période de diffusion (ex: `2020`, `2024`) |
| `mediaType` | ENUM | `MOVIE` ou `SERIES` |
| `path` | VARCHAR(555) | Chemin vers le fichier vidéo (films uniquement) |
| `srcLogo` | INT (FK) | Poster utilisé comme logo |
| `srcBackground` | INT (FK) | Poster utilisé comme fond d'écran |

#### `Poster`
Répertoire de toutes les images (logos, fonds, affiches). L'AUTO_INCREMENT commence à **100 000**. Le fichier image réel est servi via le module `/poster`.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | INT (début 100 000) | Identifiant unique |
| `name` | VARCHAR(255) | Nom du fichier image |

#### `Media_Poster`
Associe plusieurs posters à un média avec un type d'affichage.

| Colonne | Type | Description |
|---------|------|-------------|
| `mediaId` | INT (FK) | Référence vers `Media` |
| `posterId` | INT (FK) | Référence vers `Poster` |
| `type` | ENUM | `NORMAL`, `SPECIAL`, `LICENSE`, `HORIZONTAL` |

#### `Translation_Title`
Titres traduits d'un média dans différentes langues.

| Colonne | Type | Description |
|---------|------|-------------|
| `title` | VARCHAR(255) | Titre traduit |
| `iso_639_1` | ENUM | Langue : `VO`, `FR`, `US`, `ES`, `DE`, `IT`, `JP`, `RU`, `KR`, `CN`, `PT` |
| `mediaId` | INT (FK) | Référence vers `Media` |

#### `Category`
Genres cinématographiques (Comédie, Action, Horreur…). L'AUTO_INCREMENT commence à **600**. 16 catégories par défaut sont insérées au démarrage.

| Colonne | Type | Description |
|---------|------|-------------|
| `name` | VARCHAR(255) | Nom du genre (ex: `Action`) |
| `nameSelection` | VARCHAR(255) | Nom affiché dans les sélections |

#### `Media_Category`
Table de jointure Many-to-Many entre `Media` et `Category`.

**Contrainte** : La combinaison `(mediaId, categoryId)` est unique.

#### `Credit`
Acteurs et réalisateurs liés aux médias.

| Colonne | Type | Description |
|---------|------|-------------|
| `fullName` | VARCHAR(255) | Nom complet |
| `job` | ENUM | `ACTOR` ou `DIRECTOR` |

#### `Media_Credit`
Table de jointure Many-to-Many entre `Media` et `Credit`.

**Contrainte** : La combinaison `(mediaId, creditId)` est unique.

#### `Keyword`
Mots-clés associés à un média pour améliorer la recherche.

| Colonne | Type | Description |
|---------|------|-------------|
| `name` | VARCHAR(100) | Le mot-clé |
| `mediaId` | INT (FK) | Référence vers `Media` |

#### `Similar_Title`
Liens de similarité entre médias, utilisés pour les recommandations "Vous aimerez aussi".

| Colonne | Type | Description |
|---------|------|-------------|
| `sourceId` | INT (FK) | Média source |
| `targetId` | INT (FK) | Média suggéré |
| `rate` | DECIMAL(6,3) | Score de similarité |

**Contrainte** : La paire `(sourceId, targetId)` est unique.

---

### 📺 Domaine Séries

Les séries (`Media` avec `mediaType = 'SERIES'`) ont une hiérarchie à trois niveaux : **Série → Saison → Épisode**.

#### `Season`
Saisons d'une série. L'AUTO_INCREMENT commence à **5 000 000**.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | INT (début 5 000 000) | Identifiant unique |
| `seriesId` | INT (FK) | Référence vers `Media` (la série parente) |
| `mediaLibraryId` | CHAR(36) UNIQUE | ID mediaLibraryId |
| `name` | VARCHAR(255) | Nom de la saison |
| `seasonNumber` | INT | Numéro de saison |
| `srcPoster` | INT (FK) | Poster de la saison (nullable) |

#### `Episode`
Épisodes d'une série. L'AUTO_INCREMENT commence à **8 000 000**.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | INT (début 8 000 000) | Identifiant unique |
| `seriesId` | INT (FK) | Référence vers `Media` (la série parente) |
| `seasonId` | INT (FK) | Référence vers `Season` |
| `mediaLibraryId` | CHAR(36) UNIQUE | ID mediaLibraryId |
| `name` | VARCHAR(255) | Titre de l'épisode |
| `episodeNumber` | INT | Numéro dans la saison |
| `description` | VARCHAR(1024) | Synopsis |
| `date` | DATE | Date de diffusion |
| `time` | BIGINT UNSIGNED | Durée en millisecondes |
| `quality` | VARCHAR(50) | Qualité vidéo |
| `path` | VARCHAR(555) | Chemin vers le fichier vidéo |
| `srcPoster` | INT (FK) | Vignette de l'épisode (nullable) |

> Les IDs de début très élevés (`2M`, `5M`, `8M`) permettent d'identifier immédiatement en base à quelle entité appartient un ID donné.

---

### 🗂️ Domaine Organisation (Licences & Sélections)

Ce domaine permet d'organiser le contenu pour l'affichage dans l'application.

#### `License`
Une licence regroupe des médias autour d'une marque ou franchise (ex: Marvel, Star Wars, Disney). L'AUTO_INCREMENT commence à **10 000**.

| Colonne | Type | Description |
|---------|------|-------------|
| `name` | VARCHAR(255) | Nom de la licence |
| `orderIndex` | INT | Ordre d'affichage (plus petit = affiché en premier) |
| `position` | BOOLEAN | `true` = affiché sur la page d'accueil |
| `srcIcon` | INT (FK) | Icône de la licence |
| `srcLogo` | INT (FK) | Logo de la licence |
| `srcBackground` | INT (FK) | Image de fond |

#### `License_Media`
Médias appartenant à une licence, avec un ordre d'affichage.

| Colonne | Type | Description |
|---------|------|-------------|
| `licenseId` | INT (FK) | Référence vers `License` |
| `mediaId` | INT (FK) | Référence vers `Media` |
| `orderIndex` | INT | Ordre dans la licence |

#### `Selection`
Une sélection est une collection thématique de médias (ex: "Les meilleurs films d'animation"). L'AUTO_INCREMENT commence à **30 000**.

| Colonne | Type | Description |
|---------|------|-------------|
| `name` | VARCHAR(255) | Nom de la sélection |
| `selectionType` | ENUM | `NORMAL_POSTER` ou `SPECIAL_POSTER` (type d'affichage) |

#### `Selection_Media`
Médias dans une sélection, triés par `orderIndex`.

**Contrainte** : La combinaison `(selectionId, mediaId)` est unique.

#### `Selection_Page`
Détermine sur quelles pages une sélection est affichée et dans quel ordre.

| Colonne | Type | Description |
|---------|------|-------------|
| `selectionId` | INT (FK) | Référence vers `Selection` |
| `orderIndex` | INT | Ordre d'affichage sur la page |
| `pageType` | ENUM | `HOME`, `MOVIES` ou `SERIES` |

#### `License_Selection`
Lie une sélection à une licence, avec un ordre d'affichage dans la page de la licence.

**Contrainte** : La combinaison `(licenseId, selectionId)` est unique.

---

### 📰 Domaine Actualités

#### `News`
Actualités affichées sur la page d'accueil, associées à un média. L'AUTO_INCREMENT commence à **90 000**.

| Colonne | Type | Description |
|---------|------|-------------|
| `srcBackground` | INT (FK) | Image de fond (nullable) |
| `orientation` | INT | Disposition visuelle (1, 2 ou 3) |
| `mediaId` | INT (FK) | Média associé à l'actualité |
| `orderIndex` | INT | Ordre d'affichage |

#### `News_Video_Running`
Vidéos promotionnelles défilantes sur les pages Films et Séries. L'AUTO_INCREMENT commence à **50 000**.

| Colonne | Type | Description |
|---------|------|-------------|
| `srcBackground` | INT (FK) | Image de fond (nullable) |
| `startShow` / `endShow` | VARCHAR(10) | Période d'affichage |
| `mediaLibraryId` | CHAR(36) | ID mediaLibraryId de la vidéo |
| `path` | VARCHAR(555) | Chemin vers le fichier vidéo |
| `mediaId` | INT (FK) | Média lié |

---

### 🔑 Stratégie des clés étrangères

Toutes les relations respectent une politique cohérente :

- **`ON DELETE RESTRICT`** : Empêche la suppression d'un enregistrement parent s'il est encore référencé. Par exemple, on ne peut pas supprimer un `Media` s'il existe encore des `Episode`, `Keyword` ou entrées dans `User_Media_List` qui le référencent.
- **`ON DELETE SET NULL`** : Utilisé pour les champs optionnels comme `profilPhoto` (User), `srcLogo` ou `srcBackground` (Media). La suppression d'un poster met simplement la référence à NULL sans bloquer.
- **`ON UPDATE CASCADE`** : Toutes les relations propagent automatiquement les modifications d'ID parent.

---

### 📊 Indexation

Tous les champs de jointure (`userId`, `mediaId`, `selectionId`, etc.) sont indexés pour garantir des performances optimales sur les requêtes avec jointures. Exemple de la table `Stat_User` :

```sql
INDEX IDX_SU_MOVIE    (movieId)
INDEX IDX_SU_EPISODE  (episodeId)
INDEX IDX_SU_USER     (userId)
```

---

### 🌱 Données initiales

Lors de l'importation de `db.sql`, les données suivantes sont insérées automatiquement :

**Compte administrateur** : Un utilisateur `ChocoPops` avec le rôle `ADMIN` est créé.

**16 catégories** : Comédie, Animation, Drame, Fantastique, Science Fiction, Action, Horreur, Guerre/Thriller, Crime, Aventure, Romance, Histoire, Mystère, Musique, Western, Familiale.

---

## 🔐 Authentification et sécurité

### Système d'authentification JWT

L'API utilise un système d'authentification robuste basé sur JWT (JSON Web Tokens) :

1. **Inscription avec vérification email** :
   - L'utilisateur s'inscrit avec ses informations
   - Un code de vérification à 6 chiffres est envoyé par email
   - L'utilisateur valide son email avec ce code
   - Le compte est créé avec le rôle `NOT_ACTIVATE`
   - Un admin doit activer le compte pour que l'utilisateur puisse se connecter

2. **Connexion** :
   - Login avec email et mot de passe (hashé avec bcrypt)
   - Retourne un access token JWT
   - Le token contient l'ID utilisateur (`sub`) et le rôle

3. **Protection des routes** :
   - Routes publiques : Décorateur `@Public()`
   - Routes authentifiées : Guard JWT par défaut
   - Routes admin : `@UseGuards(AdminUserGuard)`
   - Extraction de l'utilisateur courant : `@CurrentUser('sub')`

### Guards disponibles

- **JwtAuthGuard** : Vérifie la validité du JWT (appliqué globalement)
- **AdminUserGuard** : Vérifie que l'utilisateur a le rôle `ADMIN`
- **Public Decorator** : Exempte une route de l'authentification JWT

### Rôles utilisateur

```typescript
enum Role {
  ADMIN        // Accès complet à toutes les fonctionnalités
  USER         // Utilisateur standard activé
  FAMILY       // Membre de la famille (permissions limitées)
  NOT_ACTIVATE // Compte créé mais non activé par un admin
  SUSPENDED    // Compte suspendu
}
```

## 📡 API Endpoints

### 🔑 Authentication (`/auth`)

| Méthode | Route | Description | Public |
|---------|-------|-------------|--------|
| POST | `/auth/login` | Connexion utilisateur | ✅ |
| POST | `/auth/send-verification-code` | Envoi du code de vérification par email | ✅ |
| POST | `/auth/register` | Validation du code et création du compte | ✅ |
| POST | `/auth/resend-verification-code` | Renvoyer un code de vérification | ✅ |

**Flux d'inscription complet** :
```
1. POST /auth/send-verification-code → Envoie code à l'email
2. POST /auth/register (avec code) → Crée le compte (NOT_ACTIVATE)
3. Admin change le rôle → Envoi email avec mot de passe
4. POST /auth/login → Connexion possible
```

---

### 👤 Users (`/user`)

| Méthode | Route | Description | Auth | Admin |
|---------|-------|-------------|------|-------|
| GET | `/user/current-user` | Informations de l'utilisateur connecté | ✅ | - |
| GET | `/user/all-user` | Liste de tous les utilisateurs | ✅ | ✅ |
| GET | `/user/my-list` | Ma liste personnelle de médias | ✅ | - |
| PUT | `/user/toggle-into-my-list/:mediaId` | Ajouter/retirer un média de ma liste | ✅ | - |
| PUT | `/user/profil-picture/:idProfilPicture` | Changer la photo de profil | ✅ | - |
| PUT | `/user/update-user-by-user` | Modifier ses informations personnelles | ✅ | - |
| PUT | `/user/update-role-by-admin/:id` | Changer le rôle d'un utilisateur | ✅ | ✅ |
| DELETE | `/user` | Supprimer son propre compte | ✅ | - |
| DELETE | `/user/delete-user-by-admin/:id` | Supprimer un utilisateur | ✅ | ✅ |

**Note importante** : Lorsqu'un admin change le rôle d'un utilisateur de `NOT_ACTIVATE` à `USER` ou `FAMILY`, un email est automatiquement envoyé avec un nouveau mot de passe.

---

### 🎬 Movies (`/movie`)

| Méthode | Route | Description | Auth | Admin |
|---------|-------|-------------|------|-------|
| GET | `/movie/nodes` | Liste simplifiée (nodes) de tous les films | ✅ | - |
| GET | `/movie/research/:keyWord` | Recherche de films par mot-clé | ✅ | - |
| GET | `/movie/random-movie` | Film aléatoire | ✅ | - |
| GET | `/movie/watchProgress/:movieId` | Obtenir la dernière progression du film selon l'utilisateur | ✅ | - |
| GET | `/movie/:id` | Détails complets d'un film | ✅ | - |
| POST | `/movie/add` | Ajouter un nouveau film | ✅ | ✅ |
| PUT | `/movie/modify` | Modifier un film existant | ✅ | ✅ |
| DELETE | `/movie/delete/:id` | Supprimer un film | ✅ | ✅ |

---

### 📺 Series (`/series`)

| Méthode | Route | Description | Auth | Admin |
|---------|-------|-------------|------|-------|
| GET | `/series/nodes` | Liste simplifiée (nodes) de toutes les séries | ✅ | - |
| GET | `/series/research/:keyWord` | Recherche de séries par mot-clé | ✅ | - |
| GET | `/series/episodes/:idSeries/:idSeason` | Obtenir tous les épisodes d'une saison | ✅ | - |
| GET | `/series/random-series` | Série aléatoire | ✅ | - |
| GET | `/series/first-episode/:seriesId` | Obtenir le premier épisode d'une série | ✅ | - |
| GET | `/series/last-episode-watched/:seriesId` | Obtenir le dernier épisode visionné selon l'utilisateur | ✅ | - |
| GET | `/series/watchProgress/:episodeId` | Obtenir la dernière progression d'un épisode selon l'utilisateur | ✅ | - |
| GET | `/series/:id` | Détails complets d'une série | ✅ | - |
| POST | `/series/add` | Ajouter une nouvelle série | ✅ | ✅ |
| PUT | `/series/modify` | Modifier une série existante | ✅ | ✅ |
| DELETE | `/series/delete/:id` | Supprimer une série | ✅ | ✅ |

---

### 🎭 Media (`/media`)

| Méthode | Route | Description | Auth | Admin |
|---------|-------|-------------|------|-------|
| GET | `/media/research/:keyword` | Recherche globale (films + séries) | ✅ | - |
| GET | `/media/catalog?decadeFilter=&categoryFilter=&mediaTypeFilter=&sortFilter=&orderDirection=&count=&offset=?` | Obtenir un catalogue globale selon les filtres | ✅ | - |
| GET | `/media/null-poster` | Médias sans poster (pour maintenance) | ✅ | ✅ |
| GET | `/media/path-dont-exist` | Médias avec répertoire inexistant (pour maintenance) | ✅ | ✅ |

---

### 🏷️ Categories (`/category`)

| Méthode | Route | Description | Auth | Admin |
|---------|-------|-------------|------|-------|
| GET | `/category/graph` | Données pour graphique des catégories | ✅ | - |
| GET | `/category/all-categories` | Liste de toutes les catégories | ✅ | - |
| GET | `/category/:id` | Détails d'une catégorie avec ses médias | ✅ | - |
| POST | `/category/save-category` | Créer une nouvelle catégorie | ✅ | ✅ |
| PUT | `/category/update-category` | Modifier une catégorie | ✅ | ✅ |
| DELETE | `/category/:id` | Supprimer une catégorie | ✅ | ✅ |

---

### 🎫 Licenses (`/license`)

Les licences organisent le contenu par thème (ex: Marvel, Star Wars, Disney).

| Méthode | Route | Description | Auth | Admin |
|---------|-------|-------------|------|-------|
| GET | `/license/graph` | Données pour graphique des licences | ✅ | - |
| GET | `/license/home-page` | Licences affichées sur la page d'accueil | ✅ | - |
| GET | `/license/research-page` | Licences pour la page de recherche | ✅ | - |
| GET | `/license/research/:keyWord` | Recherche de licences | ✅ | - |
| GET | `/license/:id` | Détails complets d'une licence | ✅ | - |
| POST | `/license/add` | Créer une nouvelle licence | ✅ | ✅ |
| PUT | `/license/modify` | Modifier une licence | ✅ | ✅ |
| PUT | `/license/change-order-home-license` | Réorganiser l'ordre des licences (accueil) | ✅ | ✅ |
| PUT | `/license/change-order-research-license` | Réorganiser l'ordre des licences (recherche) | ✅ | ✅ |
| DELETE | `/license/delete/:id` | Supprimer une licence | ✅ | ✅ |

---

### 📑 Selections (`/selection`)

Les sélections sont des collections thématiques de films/séries.

| Méthode | Route | Description | Auth | Admin |
|---------|-------|-------------|------|-------|
| GET | `/selection/graph` | Données pour graphique des sélections | ✅ | - |
| GET | `/selection/selection-home` | Sélections pour la page d'accueil | ✅ | - |
| GET | `/selection/random-media-selection-by-type/:mediaType` | Sélections aléatoires par type | ✅ | - |
| GET | `/selection/research/:keyWord` | Recherche de sélections | ✅ | - |
| GET | `/selection/:id` | Détails d'une sélection avec ses médias | ✅ | - |
| POST | `/selection/add` | Créer une nouvelle sélection | ✅ | ✅ |
| PUT | `/selection/modify` | Modifier une sélection | ✅ | ✅ |
| PUT | `/selection/update-selection-page-home` | Mettre à jour les sélections de la page d'accueil | ✅ | ✅ |
| DELETE | `/selection/delete/:id` | Supprimer une sélection | ✅ | ✅ |

---

### 📰 News (`/news`)

Actualités affichées sur la page d'accueil.

| Méthode | Route | Description | Auth | Admin |
|---------|-------|-------------|------|-------|
| GET | `/news` | Liste de toutes les actualités | ✅ | - |
| PUT | `/news` | Mettre à jour les actualités | ✅ | ✅ |

---

### 🎥 News Video Running (`/news-video-running`)

Vidéos tournantes sur les pages Films et Séries.

| Méthode | Route | Description | Auth | Admin |
|---------|-------|-------------|------|-------|
| GET | `/news-video-running/movies` | Vidéo aléatoire pour la page Films | ✅ | - |
| GET | `/news-video-running/series` | Vidéo aléatoire pour la page Séries | ✅ | - |
| GET | `/news-video-running/all-movies` | Toutes les vidéos (Films) | ✅ | - |
| GET | `/news-video-running/all-series` | Toutes les vidéos (Séries) | ✅ | - |
| PUT | `/news-video-running/movies` | Mettre à jour les vidéos (Films) | ✅ | ✅ |
| PUT | `/news-video-running/series` | Mettre à jour les vidéos (Séries) | ✅ | ✅ |

---

### 🔗 Similar Titles (`/similar-title`)

Gestion des suggestions de contenu similaire.

| Méthode | Route | Description | Auth | Admin |
|---------|-------|-------------|------|-------|
| GET | `/similar-title/links` | Liens entre médias similaires | ✅ | - |
| GET | `/similar-title/:id` | Titres similaires pour un média | ✅ | - |
| GET | `/similar-title/movie-with-less-similar-titles` | Médias avec peu de suggestions | ✅ | ✅ |
| PUT | `/similar-title/rewrite-all-data` | Recalculer tous les titres similaires | ✅ | ✅ |

---

### 📺 Streaming (`/stream`)

Routes de streaming vidéo sécurisées avec authentification par token query.

| Méthode | Route | Description | Public |
|---------|-------|-------------|--------|
| GET | `/stream/stream-movie/:movieId?token=xxx` | Stream d'un film | ✅ |
| GET | `/stream/stream-episode/:seasonId/:episodeId?token=xxx` | Stream d'un épisode | ✅ |
| GET | `/stream/stream-news/:newsId?token=xxx` | Stream d'une vidéo news | ✅ |

**Note** : Ces routes sont publiques mais nécessitent un token JWT valide en query parameter pour la sécurité.

---

### 🖼️ Profil Photos (`/profil-photo`)

| Méthode | Route | Description | Auth | Admin |
|---------|-------|-------------|------|-------|
| GET | `/profil-photo` | Liste des photos de profil disponibles | ✅ | - |
| POST | `/profil-photo` | Remplir la base avec des photos par défaut | ✅ | ✅ |

---

### 🎬 TMDB Integration (`/tmdb`)

Recherche de métadonnées depuis l'API The Movie Database.

| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| GET | `/tmdb/search-movie-tmdb/:movie` | Chercher un film (par titre ou ID TMDB) | ✅ |
| GET | `/tmdb/search-series-tmdb/:series` | Chercher une série (par titre ou ID TMDB) | ✅ |

---

### 💬 Support (`/support`)

Système de tickets de support par email.

| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| GET | `/support` | Liste des formulaires de support | ✅ |
| POST | `/support` | Envoyer un formulaire de support par email | ✅ |

**Format du formulaire** :
```typescript
{
  subject: string;        // Sujet du problème
  areaConcerned: string;  // Page/Zone concernée
  description: string;    // Description détaillée
}
```

## 🔌 Intégrations externes

### 📧 Service de Mail (Nodemailer)

Le service de mail utilise **Nodemailer** avec des templates Handlebars (`.hbs`) pour envoyer des emails stylisés :

**Templates disponibles** (dans `/templates`) :
- `verification-code.hbs` : Code de vérification à 6 chiffres
- `password.hbs` : Nouveau mot de passe lors de l'activation
- `suspended.hbs` : Notification de suspension de compte

**Emails envoyés automatiquement** :
1. **Inscription** : Code de vérification (6 chiffres)
2. **Activation par admin** : Nouveau mot de passe généré
3. **Suspension** : Notification de suspension
4. **Support** : Formulaire de bug transmis aux admins

**Configuration SMTP** (variables d'environnement) :
```env
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USER=noreply@chocoplus.com
MAIL_PASS=xxxxx
MAIL_FROM="ChocoPlus <noreply@chocoplus.com>"
```

### 🎬 Node File System utilisé dans les librairies

Intégration selon les fichiers vidéos disponibles dans les librairies créées :
- Synchronisation automatique des bibliothèque
- Récupération des chemins de fichiers vidéo + des métadonnées avec ffmpeg
- Gestion des métadonnées (posters, descriptions)
- Détection des nouveaux contenus

### 🎥 TMDB API (The Movie Database)

Récupération des métadonnées depuis TMDB :
- Informations complètes des films/séries
- Posters et images HD
- Cast et équipe technique
- Traductions multilingues
- Titres similaires

## ⚙️ Configuration

### Variables d'environnement

Créer un fichier `.env` à la racine :

```env
# Database (MariaDB)
DB_HOST="localhost"
DB_PORT=3306
DB_USER="root"
DB_PASS="votre-mot-de-passe"
DB_NAME="chocoplus"
DB_CONNECTION_LIMIT=10
API_URL="http://localhost:3000"

# JWT
JWT_SECRET="votre-secret-jwt-super-securise"
JWT_EXPIRES_IN="7d"

# Mail (SMTP)
MAIL_HOST="smtp.gmail.com"
MAIL_PORT=587
MAIL_USER="votre-email@gmail.com"
MAIL_PASS="votre-mot-de-passe-app"
MAIL_FROM="ChocoPlus <noreply@chocoplus.com>"

# TMDB API
TMDB_API_KEY="votre-cle-api-tmdb"
TMDB_BASE_URL="https://api.themoviedb.org/3"

# Application
PORT=3000
NODE_ENV=development

#header
HEADER_SECRET_API="votre-cle-secrete-api"
HEADER_NAME_FIELD_SECRET_API="nom-du-header"
```

### Configuration MariaDB

Le projet utilise le **driver natif MariaDB** avec un pool de connexions configuré dans `database.module.ts`.

**Configuration du pool** :
```typescript
// database.module.ts
const pool = mariadb.createPool({
  host: config.get('DB_HOST'),
  port: config.get('DB_PORT'),
  user: config.get('DB_USER'),
  password: config.get('DB_PASS'),
  database: config.get('DB_NAME'),
  connectionLimit: config.get('DB_CONNECTION_LIMIT'), // Nombre max de connexions
  decimalAsNumber: true,
  bigIntAsNumber: true
});
```

**Recommandations** :
- `DB_CONNECTION_LIMIT` : 10-20 pour usage standard, plus pour haute charge
- Pool global injecté dans tous les services via `@Inject(DATABASE_POOL)`
- Toujours libérer les connexions avec `conn.release()` dans un bloc `finally`

## 📥 Installation

### Prérequis

- **Node.js** : 18.x ou supérieur
- **npm** : 9.x ou supérieur
- **MariaDB/MySQL** : 10.x ou supérieur
- **Ffmpeg** : pour la récupération des métadonnées des fichiers courants (durée, résolution en pixel ...)
- **Compte TMDB** : pour les métadonnées des films/séries

### Étapes d'installation

```bash
# 1. Cloner le repository
git clone <repository-url>
cd chocoserv

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos configurations

# 4. Configurer la base de données
# Créer la base de données
mysql -u root -p -e "CREATE DATABASE chocoplus CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Importer le schéma SQL (crée toutes les tables + données initiales)
mysql -u root -p chocoplus < db.sql

# 5. Lancer en mode développement
npm run start:dev

# 6. L'API est accessible sur http://localhost:3000
```

### Scripts disponibles

```bash
npm run start          # Lancer en mode production
npm run start:dev      # Lancer en mode développement (hot-reload)
npm run start:debug    # Lancer en mode debug
npm run build          # Compiler pour la production
npm run test           # Tests unitaires
npm run test:e2e       # Tests end-to-end
npm run lint           # Vérification du code
```

## 📁 Structure du projet

```
chocoplus-api/
├── src/
│   ├── auth/                       # Module d'authentification
│   │   ├── auth.controller.ts     # Routes d'authentification
│   │   ├── auth.service.ts        # Logique JWT
│   │   ├── auth.module.ts
│   │   └── dto/                   # Interfaces
│   │
│   ├── user/                       # Module utilisateurs
│   │   ├── user.controller.ts
│   │   ├── user.service.ts
│   │   ├── user.module.ts
│   │   └── dto/
│   │
│   ├── movie/                      # Module films
│   │   ├── movie.controller.ts
│   │   ├── movie.service.ts
│   │   ├── movie.module.ts
│   │   └── dto/
│   │
│   ├── series/                     # Module séries
│   │   ├── series.controller.ts
│   │   ├── series.service.ts
│   │   ├── series.module.ts
│   │   └── dto/
│   │
│   ├── media/                      # Module médias génériques
│   │   ├── media.controller.ts
│   │   ├── media.service.ts
│   │   └── media.module.ts
│   │
│   ├── category/                   # Module catégories
│   │   ├── controller/
│   │   ├── service/
│   │   └── dto/
│   │
│   ├── license/                    # Module licences
│   │   ├── controller/
│   │   ├── service/
│   │   └── dto/
│   │
│   ├── selection/                  # Module sélections
│   │   ├── controller/
│   │   ├── service/
│   │   └── dto/
│   │
│   ├── news/                       # Module actualités
│   │   ├── controller/
│   │   ├── service/
│   │   └── dto/
│   │
│   ├── news-video-running/         # Module vidéos tournantes
│   │   ├── controller/
│   │   ├── service/
│   │   └── dto/
│   │
│   ├── stream/                     # Module streaming
│   │   ├── stream.controller.ts
│   │   ├── stream.service.ts
│   │   └── stream.module.ts
│   │
│   ├── poster/                     # Module posters
│   │   └── poster.controller.ts
│   │
│   ├── profil-photo/               # Module photos de profil
│   │   ├── controller/
│   │   ├── service/
│   │   └── dto/
│   │
│   ├── similar-title/              # Module titres similaires
│   │   ├── controller/
│   │   ├── service/
│   │   └── dto/
│   │
│   ├── support/                    # Module support
│   │   ├── support.controller.ts
│   │   ├── support.service.ts
│   │   └── dto/
│   │
│   ├── tmdb/                       # Module TMDB
│   │   ├── controller/
│   │   ├── service/
│   │   └── dto/
│   │
│   ├── Library/                   # Module Library
│   │   ├── controller/
│   │   ├── service/
│   │   └── dto/
│   │
│   ├── guard/                      # Guards d'authentification
│   │   ├── jwt-auth.guard.ts
│   │   ├── admin-user.guard.ts
│   │   ├── current-user.guard.ts
│   │   └── public.decorator.ts
│   │
│   ├── common-service/             # Services partagés
│   │   └── mail.service.ts        # Service d'envoi d'emails
│   │
│   ├── common-interface/           # Interfaces partagées
│   │   ├── return-message.interface.ts
│   │   ├── graph.interface.ts
│   │   ├── node.interface.ts
│   │   └── link.interface.ts
│   │
│   ├── templates/                  # Templates d'emails (Handlebars)
│   │   ├── layout.hbs             # Layout principal
│   │   ├── verification-code.hbs  # Code de vérification
│   │   ├── password.hbs           # Nouveau mot de passe
│   │   └── suspended.hbs          # Compte suspendu
│   │
│   ├── database/                   # Module de base de données
│   │   └── database.module.ts     # Configuration du pool MariaDB
│   │
│   ├── app.controller.ts           # Contrôleur principal
│   ├── app.service.ts
│   ├── app.module.ts               # Module racine
│   └── main.ts                     # Point d'entrée
│
├── test/                           # Tests
│   ├── app.e2e-spec.ts
│   └── jest-e2e.json
│
├── db.sql                          # Schéma de base de données SQL
├── .env                            # Variables d'environnement
├── .env.example                    # Exemple de configuration
├── nest-cli.json                   # Configuration NestJS CLI
├── tsconfig.json                   # Configuration TypeScript
├── package.json
└── README.md
```

## 🛠️ Technologies utilisées

### Framework et langage

| Technologie | Version | Usage |
|------------|---------|-------|
| NestJS | 10.x | Framework backend Node.js |
| TypeScript | 5.x | Langage de programmation |
| Node.js | 18.x+ | Runtime JavaScript |

### Base de données

| Technologie | Usage |
|------------|-------|
| MariaDB | Base de données relationnelle |
| mariadb (npm) | Driver natif Node.js avec pool de connexions |

### Authentification et sécurité

| Technologie | Usage |
|------------|-------|
| JWT (jsonwebtoken) | Tokens d'authentification |
| bcrypt | Hashage des mots de passe |
| Passport JWT | Stratégie d'authentification |

### Envoi d'emails

| Technologie | Usage |
|------------|-------|
| Nodemailer | Service SMTP |
| Handlebars (HBS) | Templates d'emails |

### APIs externes

| Service | Usage |
|---------|-------|
| TMDB API | Métadonnées films/séries |

### Outils de développement

| Outil | Usage |
|-------|-------|
| ESLint | Linting du code |
| Prettier | Formatage du code |
| Jest | Tests unitaires |
| Supertest | Tests E2E |

## 🔒 Sécurité

- **HTTPS recommandé** pour la production
- **CORS configuré** pour autoriser uniquement l'application Electron
- **Rate limiting** pour éviter les abus
- **Validation des entrées** avec class-validator
- **Sanitization** des données utilisateur
- **Tokens JWT** avec expiration
- **Mots de passe hashés** avec bcrypt (salt rounds: 15)

## 📈 Performance

- **Pool de connexions** : Réutilisation des connexions pour éviter l'overhead
- **Libération systématique** : Toujours utiliser `finally` pour `conn.release()`
- **Requêtes préparées** : Protection contre les injections SQL via paramètres `?`
- **Pagination** sur les listes de médias
- **Indexation** des champs de recherche dans la base de données
- **Streaming vidéo optimisé** avec range requests

**Exemple de bonne pratique** :
```typescript
async getMovies(limit: number, offset: number): Promise<Movie[]> {
  const conn = await this.pool.getConnection();
  try {
    // Requête paramétrée pour éviter les injections SQL
    const rows = await conn.query(
      'SELECT * FROM Media WHERE mediaType = ? LIMIT ? OFFSET ?',
      ['MOVIE', limit, offset]
    );
    return rows;
  } finally {
    // TOUJOURS libérer la connexion
    conn.release();
  }
}
```

## 📝 Notes importantes

### Workflow d'inscription utilisateur

1. Utilisateur remplit le formulaire → `POST /auth/send-verification-code`
2. Email avec code à 6 chiffres envoyé
3. Utilisateur valide le code → `POST /auth/register`
4. Compte créé avec rôle `NOT_ACTIVATE`
5. Admin change le rôle via → `PUT /user/update-role-by-admin/:id`
6. Email automatique avec nouveau mot de passe
7. Utilisateur peut se connecter → `POST /auth/login`

### Gestion du streaming

Le streaming utilise **Range Requests** pour permettre :
- La lecture en continu
- Le seek dans la vidéo
- La gestion de la bande passante
- Le support des sous-titres

### Synchronisation des médiathèques

L'API peut :
- Détecter automatiquement les nouveaux médias dans médiathèques qui ont été créées
- Importer les métadonnées avec ffmpeg
- Synchroniser les chemins de fichiers
- Détecter les incohérences (médias supprimés, IDs invalides)

## 🤝 Contribution

Ce projet est public. Pour toute question, contactez l'équipe de développement.

## 📄 License

Projet public - Tous droits réservés

---

**Développé avec ❤️ et 🍫 par l'équipe ChocoPlus**

*API Version 1.0.0 - Janvier 2025*
