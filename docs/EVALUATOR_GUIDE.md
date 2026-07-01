# Weave — Guide d'évaluation

Ce guide vous permet de tester Weave **à fond**, en autonomie, et de partager la démarche en interne. La démo intègre aussi une **visite guidée** (bouton « Visite guidée » en haut à droite) pour un premier contact ; ce document sert à aller plus loin et à reproduire chaque comportement.

---

## 1. Ce que vous testez

**Weave est un *cognitive runtime*** : une couche de mémoire d'organisation qui, à partir de l'activité IA quotidienne des équipes, fait **émerger automatiquement** des compétences réutilisables puis des agents spécialistes — sans que personne ne les écrive à la main.

La mémoire est **scopée** sur quatre niveaux : `perso → équipe → projet → organisation`. Une compétence naît dans un projet ; si le même schéma se répète entre plusieurs équipes, elle est **promue** au niveau organisation.

**Ce à quoi ressemble un succès :** vous lancez de l'activité, vous voyez des faits extraits en direct, un schéma franchit un seuil, une **compétence émerge toute seule**, un **agent** spécialiste apparaît, et une question posée à l'organisation reçoit une réponse **qui cite ses sources par couche de mémoire**.

---

## 2. Démarrage

### Prérequis

- **Docker** (Postgres + pgvector)
- **Ollama** en local avec un modèle installé (embeddings + LLM offline) — voir `.env.example`
- **Rust** (`cargo`, édition stable récente)
- **Node ≥ 20** + **pnpm**

### Lancer la stack

```bash
# 1. Base de données (Postgres + pgvector)
docker-compose up -d

# 2. Variables d'environnement
cp .env.example .env
# éditez .env si besoin (DATABASE_URL, provider d'embeddings, modèle Ollama…)

# 3. Modèle d'embeddings local (si pas déjà présent)
ollama pull nomic-embed-text

# 4. API (Rust / Axum) — applique les migrations au démarrage
cargo run
# → API sur http://127.0.0.1:8787

# 5. Interface web (dans un second terminal)
cd apps/web
pnpm install
pnpm dev
# → UI sur http://localhost:3000
```

Ouvrez **http://localhost:3000**. En haut à droite, l'indicateur doit passer à **« en direct »** (flux SSE connecté) et le badge du modèle LLM doit s'afficher.

> Astuce : `NEXT_PUBLIC_WEAVE_API` permet de pointer l'UI vers une autre URL d'API.

---

## 3. Scénarios de test

Chaque scénario est reproductible. Utilisez la **barre de vue** en haut pour vous restreindre à une organisation / équipe / projet.

### S1 — Émergence spontanée d'une compétence
1. Cliquez **« Simuler l'activité »**.
2. Observez le **Flux d'activité IA** : messages ingérés → faits extraits → un **schéma** progresse vers son seuil (barre de progression).
3. **Attendu :** au franchissement du seuil, une **compétence** apparaît dans « Compétences vivantes » avec une animation d'émergence, et un bandeau l'annonce.

### S2 — Émergence forcée (déterministe)
1. Dans la barre de vue, sélectionnez une **équipe puis un projet**.
2. Dans « Injecter un message », envoyez **5 fois la même question** (ex. « Comment relancer la synchro bancaire ? »).
3. **Attendu :** au 5ᵉ envoi, une compétence naît dans ce projet — l'émergence est déterministe, pas aléatoire.

### S3 — Promotion au niveau organisation
1. Reproduisez le même schéma (même type de question) dans **deux équipes différentes**.
2. **Attendu :** la compétence est **promue** au niveau `organization` (icône bâtiment, bandeau « compétence org promue »). Elle devient une convention partagée entre équipes.

### S4 — Émergence d'un agent
1. Laissez une équipe accumuler **plusieurs compétences** dans un même domaine (relancez « Simuler » ou injectez).
2. **Attendu :** un **agent spécialiste** émerge pour cette équipe, en statut *en attente*. Cliquez **« Approuver »** → il passe *actif*.

### S5 — Interroger la mémoire partagée
1. Dans « Interroger la mémoire partagée », posez une question (ex. « Comment relancer la synchro bancaire ? »).
2. **Attendu :** une réponse, et à droite la **provenance** : les couches `personal / team / project / organization` qui ont contribué, avec l'auteur de chaque fait. Si une compétence a servi, elle est indiquée (« compétence utilisée »).

### S6 — Isolation multi-tenant
1. Changez d'**organisation** via le sélecteur en haut (presets).
2. **Attendu :** la mémoire, les compétences et les agents affichés sont **isolés par organisation** — aucune fuite d'une org à l'autre.

---

## 4. Ce que chaque scénario prouve

| Scénario | Claim produit démontré |
|----------|------------------------|
| S1 | La mémoire se construit **toute seule** à partir de l'activité réelle. |
| S2 | L'émergence est **déterministe et reproductible**, pas un effet de démo. |
| S3 | Les compétences **remontent** du projet vers l'organisation quand elles sont partagées. |
| S4 | Des **agents spécialistes** émergent des compétences — personne ne les code. |
| S5 | Chaque réponse est **traçable** : provenance par couche de mémoire. |
| S6 | Architecture **multi-tenant** : isolation stricte par organisation. |

---

## 5. Limites du MVP / hors-périmètre

- **Données simulées** : le bouton « Simuler » et l'injection manuelle remplacent, pour la démo, les connecteurs réels (Slack, etc. — un connecteur Slack en lecture seule existe côté ingestion mais n'est pas branché dans ce bac à sable).
- **LLM local** : réponses générées via Ollama en local pour rester hors-ligne ; la qualité de formulation dépend du modèle installé, pas de la logique de mémoire.
- **Seuils** : les seuils d'émergence sont réglés pour une démo courte (quelques occurrences), pas pour un volume de production.
- **Pas de gestion des accès / SSO** dans ce MVP : le scoping mémoire est fonctionnel, la couche d'authentification ne l'est pas encore.
- **Desktop-first** : l'UI est pensée pour une évaluation sur écran large.

---

## En cas de souci

- Indicateur **« hors ligne »** : l'API n'est pas joignable — vérifiez que `cargo run` tourne sur `:8787` et que `NEXT_PUBLIC_WEAVE_API` correspond.
- Aucun modèle LLM affiché : vérifiez qu'Ollama tourne et que le modèle de `.env` est installé (`ollama list`).
- Rien n'émerge : cliquez **« Réinitialiser »** puis relancez « Simuler l'activité ».
