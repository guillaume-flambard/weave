# Weave API

> **Cognitive Runtime** — transforme l'activité d'équipe (Slack, Notion) en mémoire structurée, fait émerger des **compétences** et des **agents** sans runbook écrit à la main.

| | |
|---|---|
| **Spec OpenAPI** | [`openapi.yaml`](./openapi.yaml) (3.1) · live `GET /openapi.yaml` |
| **Local** | `http://127.0.0.1:8787` |
| **Prod** | `https://strayeye.com/weave-api` (proxy Next.js) |
| **UI chat** | `http://localhost:3200` |

---

## Vue d'ensemble

```
Slack / Notion / manual
        │
        ▼
   POST /ingest/*  ·  POST /simulate  ·  POST /inject
        │
        ▼
  Pipeline (extract → graph → patterns → skills → agents)
        │
        ├── GET /events  (SSE live)
        ├── GET /facts · /skills · /graph · /stats
        ├── POST /ask    (Q&A + provenance 4 couches)
        └── POST /agents/* (gouvernance + orchestration)
```

Chaque **projet** (`project=pennylane` par défaut) isole events, faits, compétences et agents — c'est le tenant sandbox.

---

## Démarrage rapide

```bash
# 1. Infra
docker compose up -d

# 2. API
cp .env.example .env    # GROQ_API_KEY, DATABASE_URL, …
cargo run -p weave-api

# 3. Vérifier
curl -s http://127.0.0.1:8787/health | jq
```

**Hero demo (~90 s)**

```bash
# Reset + simulation d'activité PennyLane
curl -X POST "http://127.0.0.1:8787/reset?project=pennylane"
curl -X POST http://127.0.0.1:8787/simulate \
  -H "Content-Type: application/json" \
  -d '{"project":"pennylane"}'

# Suivre le flux live
curl -N http://127.0.0.1:8787/events

# Interroger la mémoire
curl -X POST http://127.0.0.1:8787/ask \
  -H "Content-Type: application/json" \
  -d '{"project":"pennylane","question":"Comment relancer la synchro bancaire ?"}'
```

---

## Authentification

Si `WEAVE_API_KEY` est défini côté serveur, les routes **mutatives** exigent :

```http
Authorization: Bearer <clé>
```

ou

```http
X-API-Key: <clé>
```

Routes publiques (sans clé) : `GET /health`, `GET /org/presets`, flux OAuth.

Quand `WEAVE_API_KEY` est défini, les routes mémoire (`/stats`, `/facts`, `/skills`, …) et **SSE** exigent la clé. Pour SSE (`EventSource` sans headers) : `GET /events?api_key=…`.

---

## Endpoints par domaine

### Santé & temps réel

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/health` | Status + provider LLM actif (`groq`, `ollama`, …) |
| `GET` | `/events` | **SSE** — flux pipeline en direct |

### Ingestion

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/simulate` | ~66 messages Slack/Notion simulés (async) |
| `POST` | `/replay` | Rejoue le dataset seed |
| `POST` | `/inject` | Message manuel (un membre d'équipe) |
| `POST` | `/ingest/slack` | Canaux Slack de l'utilisateur connecté |
| `POST` | `/ingest/notion` | Workspace Notion (live ou seed) |

### Mémoire

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/stats?project=` | Compteurs (events, faits, skills, agents) |
| `GET` | `/facts?project=` | 100 faits récents |
| `GET` | `/skills?project=` | Compétences émergées |
| `GET` | `/graph?project=` | Entités + relations |
| `POST` | `/ask` | Question → réponse + couches mémoire |

### Agents & gouvernance

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/agents?project=` | Agents prédéfinis + émergents |
| `POST` | `/agents/approve` | Active un agent `pending` (+ write-back Notion) |
| `POST` | `/agents/run` | Orchestration plan → délègue → vérifie + trace |

### Organisation (sandbox)

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/org?project=` | Config org (stockée ou preset) |
| `PUT` | `/org` | Sauvegarde la config |
| `GET` | `/org/presets` | PennyLane, Acme, … |
| `POST` | `/org/load` | Charge un preset (reset + seed agents) |
| `POST` | `/reset?project=` | Vide le projet |

### Connexions OAuth

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/connections` | Slack / Notion connectés (métadonnées) |
| `DELETE` | `/connections/{provider}` | Déconnecte (`slack`, `notion`) |
| `GET` | `/oauth/slack/authorize` | Démarre OAuth Slack (user token) |
| `GET` | `/oauth/notion/authorize` | Démarre OAuth Notion |

### MCP (agents externes)

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/mcp` | JSON-RPC 2.0 — tool `ask_memory` |

Exemple `tools/call` :

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "ask_memory",
    "arguments": {
      "project": "pennylane",
      "question": "Comment relancer la synchro bancaire ?"
    }
  }
}
```

---

## Événements SSE (`GET /events`)

Chaque message SSE est un JSON avec discriminant `type` :

| `type` | Signification |
|--------|----------------|
| `event_ingested` | Message brut lu (Slack/Notion) |
| `fact_extracted` | Fait atomique extrait par le LLM |
| `entity_upserted` | Nœud graphe |
| `relationship_upserted` | Arête graphe |
| `pattern_observed` | Schéma récurrent (barre vers seuil) |
| `skill_emerged` | Compétence née |
| `agent_emerged` | Agent spécialiste émergé (`pending`) |
| `simulation_complete` | Fin batch `/simulate` |

Exemple :

```json
{
  "type": "skill_emerged",
  "id": "…",
  "name": "bancaire-relancer-synchro",
  "trigger": "Comment relancer la synchro bancaire ?",
  "referents": ["nicolas"],
  "sources_count": 5,
  "body": "…"
}
```

---

## Modèle de données (résumé)

### Couches mémoire

`personal` → `team` → `project` → `organization`

Chaque fait porte un `memory_level`. Les réponses `/ask` citent les couches utilisées.

### Compétence (Skill)

Émerge quand un **pattern** dépasse `WEAVE_SKILL_THRESHOLD` occurrences (défaut : 5). Contient un runbook Markdown (`body`), un `trigger`, des `referents`.

### Agent

Cluster de skills matures par `(équipe, thème)`. Statut initial : **`pending`** → approbation humaine via `/agents/approve`.

---

## Variables d'environnement (API)

| Variable | Rôle |
|----------|------|
| `DATABASE_URL` | Postgres + pgvector |
| `WEAVE_API_ADDR` | Bind (défaut `127.0.0.1:8787`) |
| `WEAVE_API_KEY` | Auth Bearer / X-API-Key (mutations + reads mémoire quand défini) |
| `WEAVE_LLM_PROVIDER` | `groq` · `ollama` · `claude` · `heuristic` |
| `GROQ_API_KEY` | Clé Groq (recommandé prod) |
| `WEAVE_EMBED_PROVIDER` | `hash` ou `ollama` |
| `WEAVE_SKILL_THRESHOLD` | Seuil émergence compétence |
| `WEAVE_ENC_KEY` | Chiffrement tokens OAuth (32 bytes base64) |
| `WEAVE_CORS_ORIGIN` | Origines autorisées (UI) |

Voir [`.env.example`](../../.env.example) à la racine du repo.

---

## Explorer la spec OpenAPI

**Redoc (HTML interactif)**

```bash
npx @redocly/cli build-docs docs/api/openapi.yaml -o docs/api/redoc.html
open docs/api/redoc.html   # macOS — ou double-clic dans le Finder
```

**Spec live (API en marche)**

```bash
curl -s http://127.0.0.1:8787/openapi.yaml | head
```

**Validation**

```bash
npx @redocly/cli lint docs/api/openapi.yaml
```

---

## Liens

- [README projet](../../README.md)
- [Spec technique](../Weave_Technical_Spec.md)
- [Guide évaluateur](../EVALUATOR_GUIDE.md)
- [Synthèse session juillet 2026](../SESSION-SYNTHESIS-2026-07.md)
