# 🍫 ChocoPlus API - Backend NestJS

[![NestJS](https://img.shields.io/badge/NestJS-10.x-red.svg)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![MariaDB](https://img.shields.io/badge/MariaDB-10.x-blue.svg)](https://mariadb.org/)
[![JWT](https://img.shields.io/badge/JWT-Authentication-green.svg)](https://jwt.io/)

API REST complète pour l'application **ChocoPlus**, développée avec NestJS et TypeScript. Cette API gère l'authentification, la gestion des médias (films et séries), le streaming vidéo, les licences, les sélections, et bien plus encore.

## 📋 Table des matières

- [Vue d'ensemble](#-vue-densemble)
- [Architecture](#-architecture)
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
- **Intégration Jellyfin** pour la gestion de bibliothèque multimédia
- **Intégration TMDB** pour les métadonnées
- **Système de support** avec envoi d'emails
- **Gestion des utilisateurs** avec rôles et permissions
- **Graphiques et statistiques** pour les dashboards

## 🏗️ Architecture

L'API suit l'architecture modulaire de NestJS avec une structure en couches :

```
┌──────────────────────────────────────────────┐
│            Controllers Layer                  │
│   (Routes HTTP, Validation, Guards)          │
└──────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────┐
│             Services Layer                    │
│   (Business Logic, Data Processing)          │
└──────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────┐
│      Database Layer (MariaDB Pool)            │
│   Direct SQL queries via mariadb driver      │
│         MariaDB Database                      │
└──────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────┐
│          External Services                    │
│   - Jellyfin API                             │
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
| GET | `/series/random-series` | Série aléatoire | ✅ | - |
| GET | `/series/:id` | Détails complets d'une série | ✅ | - |
| GET | `/series/episodes/:idSeries/:idSeason` | Épisodes d'une saison spécifique | ✅ | - |
| POST | `/series/add` | Ajouter une nouvelle série | ✅ | ✅ |
| PUT | `/series/modify` | Modifier une série existante | ✅ | ✅ |
| DELETE | `/series/delete/:id` | Supprimer une série | ✅ | ✅ |

---

### 🎭 Media (`/media`)

| Méthode | Route | Description | Auth | Admin |
|---------|-------|-------------|------|-------|
| GET | `/media/research/:keyword` | Recherche globale (films + séries) | ✅ | - |
| GET | `/media/null-poster` | Médias sans poster (pour maintenance) | ✅ | ✅ |

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
| GET | `/tmdb/search-movie-jellyfin/:id` | Chercher un film par ID Jellyfin | ✅ |
| GET | `/tmdb/search-series-jellyfin/:id` | Chercher une série par ID Jellyfin | ✅ |

---

### 📺 Jellyfin Integration (`/jellyfin`)

Synchronisation avec le serveur Jellyfin pour la gestion de bibliothèque.

| Méthode | Route | Description | Auth | Admin |
|---------|-------|-------------|------|-------|
| GET | `/jellyfin/reset-jellyfin-items-movie` | Réinitialiser les items films Jellyfin | ✅ | ✅ |
| GET | `/jellyfin/reset-jellyfin-items-series` | Réinitialiser les items séries Jellyfin | ✅ | ✅ |
| PUT | `/jellyfin/reset-all-movies` | Reset complet des films | ✅ | ✅ |
| PUT | `/jellyfin/reset-all-series` | Reset complet des séries | ✅ | ✅ |
| POST | `/jellyfin/save-movie-dont-saved` | Sauvegarder les films non synchronisés | ✅ | ✅ |
| POST | `/jellyfin/save-series-dont-saved` | Sauvegarder les séries non synchronisées | ✅ | ✅ |
| GET | `/jellyfin/miss-metadata-tmdb` | Items sans métadonnées TMDB | ✅ | ✅ |
| GET | `/jellyfin/media-not-saved` | Médias présents dans Jellyfin mais pas dans ChocoPlus | ✅ | ✅ |
| GET | `/jellyfin/jellyfinId-dont-exist` | Médias avec ID Jellyfin invalide | ✅ | ✅ |
| GET | `/jellyfin/audio-more` | Films avec plus de 2 pistes audio | ✅ | ✅ |

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

### 🎬 Jellyfin API

Intégration avec le serveur multimédia **Jellyfin** pour :
- Synchronisation automatique de la bibliothèque
- Récupération des chemins de fichiers vidéo
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

# Jellyfin
JELLYFIN_URL="http://localhost:8096"
JELLYFIN_API_KEY="votre-cle-api-jellyfin"

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
- **Serveur Jellyfin** (optionnel) : pour la synchronisation
- **Compte TMDB** : pour les métadonnées

### Étapes d'installation

```bash
# 1. Cloner le repository
git clone <repository-url>
cd chocoplus-api

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos configurations

# 4. Configurer la base de données
# Créer la base de données
mysql -u root -p -e "CREATE DATABASE chocoplus CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Importer le schéma SQL
mysql -u root -p chocoplus < db.sql

# 5. Lancer en mode développement
npm run start:dev

# 7. L'API est accessible sur http://localhost:3000
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
│   ├── jellyfin/                   # Module Jellyfin
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
| Jellyfin API | Gestion de bibliothèque multimédia |

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

### Synchronisation Jellyfin

L'API peut :
- Détecter automatiquement les nouveaux médias dans Jellyfin
- Importer les métadonnées depuis Jellyfin
- Synchroniser les chemins de fichiers
- Détecter les incohérences (médias supprimés, IDs invalides)

## 🤝 Contribution

Ce projet est privé. Pour toute question, contactez l'équipe de développement.

## 📄 License

Projet privé - Tous droits réservés

---

**Développé avec ❤️ et 🍫 par l'équipe ChocoPlus**

*API Version 1.0.0 - Janvier 2025*
