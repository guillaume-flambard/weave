# Weave — Cognitive Runtime (MVP)

Une couche de **mémoire organisationnelle partagée** qui transforme en continu
l'activité d'une équipe (Slack, GitHub, Notion, Linear…) en connaissance
structurée — et **fait émerger des Skills automatiquement** à partir des patterns
récurrents. Personne ne les écrit ; elles naissent du travail de l'équipe.

> Démo modelée sur un contexte fintech / compta type **PennyLane** (synchro
> bancaire via Bridge/Budget Insight, Stripe, export FEC, runbooks **Notion**).

## Le « hero demo » (~90 s)

1. On rejoue un flux d'événements réalistes (`▶ Rejouer l'activité`).
2. Le pipeline extrait des **faits atomiques**, **entités** et **relations** → le
   knowledge graph grandit en direct.
3. La même question — *« Comment relancer la synchro bancaire ? »* — revient
   plusieurs fois. Un **pattern** est détecté (barre qui monte vers le seuil).
4. **Moment magique** : la skill `bancaire-relancer-synchro` se matérialise seule
   (commandes, référent, runbook Notion).
5. L'agent répond via cette skill en affichant les **couches mémoire** utilisées
   (Perso → Projet → Org). Provenance visible. Interrogeable aussi via **MCP**.

### Couche agents (émergents)

Quand un **domaine** accumule assez de skills (ex. `finance-ops` : synchro bancaire
+ webhooks Stripe), un **agent spécialiste émerge** du cluster — comme les skills
émergent des patterns. Il reste **en attente** jusqu'à approbation humaine
(gouvernance). Une fois actif, l'assistant généraliste **délègue** les tâches de
son domaine à ce spécialiste, un **vérificateur** valide, et la **trace**
d'orchestration est affichée. Garde-fous durs : profondeur max, nombre d'agents
max, budget temps, et validation humaine des agents émergents.

## Architecture (sous-ensemble strict du Blueprint, ports & adapters)

```
crates/
  weave-core       types domaine purs (Event, Fact, Entity, Pattern, Skill…)
  weave-store      ports (traits) + adaptateur Postgres (pgvector, tsvector, graphe)
  weave-llm        LlmGateway multi-provider (Ollama|Claude|heuristique) + EmbeddingGateway
  weave-pipeline   bus + étapes → pattern → skill émergente → agent émergent + orchestrateur
  weave-ingest     Connector (stub) + dataset seed "pennylane"
  weave-api        Axum : REST + SSE (live) + MCP
apps/web           dashboard Next.js (Tailwind v4) — 4 panneaux
```

**Une seule brique d'infra : Postgres + pgvector.** Vecteurs (pgvector), full-text
(tsvector), graphe (arêtes + CTE récursive), bus (canal in-process). Chaque swap
futur (Qdrant / Kuzu / NATS) = un nouvel adaptateur, jamais une réécriture.

## Lancer

```bash
# 1. Postgres + pgvector
docker compose up -d

# 2. API. LLM multi-provider, défaut = Ollama local (aucune clé requise).
#    Alternatives : WEAVE_LLM_PROVIDER = ollama | claude | heuristic | auto
export DATABASE_URL="postgres://weave:weave@localhost:5433/weave"
export WEAVE_LLM_PROVIDER=ollama            # défaut
export WEAVE_OLLAMA_MODEL="qwen3.5:9b"      # un modèle que tu as en local
# export ANTHROPIC_API_KEY=sk-ant-...       # pour provider=claude
cargo run -p weave-api

# 3. Dashboard
pnpm --dir apps/web install
pnpm --dir apps/web dev        # http://localhost:3200
```

Puis, dans le dashboard : **Reset** → **Rejouer l'activité** → regarde la skill
émerger → pose une question à l'agent.

## API

| Méthode | Route      | Rôle                                            |
|---------|------------|-------------------------------------------------|
| POST    | `/replay`  | rejoue le dataset seed (live)                   |
| POST    | `/ingest/slack` | ingère un canal Slack réel (lecture seule) |
| GET     | `/stats`   | compteurs (events, faits, skills, agents)       |
| POST    | `/reset`   | vide le projet (répétable)                      |
| GET     | `/events`  | flux SSE des événements pipeline                |
| GET     | `/facts`   | faits récents                                   |
| GET     | `/skills`  | skills émergées                                 |
| GET     | `/graph`   | entités + relations                             |
| POST    | `/ask`     | réponse agent + provenance des couches          |
| GET     | `/agents`  | agents prédéfinis + émergents                   |
| POST    | `/agents/approve` | active un agent émergent (gouvernance)   |
| POST    | `/agents/run`     | orchestration plan→délègue→vérifie + trace|
| POST    | `/mcp`     | endpoint MCP (`ask_memory`) pour agents externes|

## Bac à sable « apporte ton org »

Le testeur recrée son monde (org → équipes → projets → personnes) et regarde la
mémoire, les compétences et les agents émerger — scopés perso → équipe → projet →
organisation.

1. **Choisir un preset** (dropdown, ex. PennyLane ou Acme) — chargé + éditable.
2. **Simuler l'activité** : chaque personne de chaque équipe « travaille avec l'IA »
   sur ses projets. Les besoins récurrents font naître une **compétence par projet** ;
   une convention partagée est **promue au niveau organisation** ; chaque équipe
   accumule un **agent spécialiste**.
3. **Filtrer par équipe/projet** (barre de vue) et **injecter ses propres messages**.

Endpoints : `GET /org`, `GET /org/presets`, `POST /org/load`, `PUT /org`,
`POST /simulate`, `POST /inject`. Génération déterministe (rapide, reproductible) ;
naturalisation LLM optionnelle.

## Embeddings (Phase 0)

Embeddings sémantiques réels via Ollama `nomic-embed-text` (768-dim) par défaut,
fallback hash local. `WEAVE_EMBED_PROVIDER = ollama | hash`.

```bash
ollama pull nomic-embed-text
```

## Connecteur Slack (lecture seule, Phase 0)

```bash
export SLACK_BOT_TOKEN=xoxb-...     # scopes: channels:history, users:read
export SLACK_CHANNEL=C0123456789
curl -X POST http://127.0.0.1:8787/ingest/slack   # même pipeline, vrais messages
```

## Tests & éval

```bash
cargo test -p weave-core -p weave-llm -p weave-ingest   # unitaires, sans DB
./scripts/eval.sh                                       # métriques E2E sur API live
```

`eval.sh` est comparable entre providers : lance le serveur avec un
`WEAVE_LLM_PROVIDER` / `WEAVE_EMBED_PROVIDER` différent et relance-le.

## Roadmap

- **v1** : connecteur Slack réel, bus → NATS JetStream, Qdrant, détection de
  contradictions, résumés multi-niveaux, auth + isolation des mémoires.
- **v2** : graphe Kuzu, recherche hybride Tantivy, time-travel / versioning.
- **Enterprise** : RBAC, multi-tenant, observabilité (OTel/Prometheus/Grafana), K8s.
