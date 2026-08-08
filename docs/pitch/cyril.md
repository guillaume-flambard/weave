# Prise de contact — Cyril Allard (Responsable IA, Pennylane)

> Cible : Cyril Allard, X, ~10 mois chez Pennylane, ex-entrepreneur, en charge de
> l'adoption des outils IA (Notion + autres). Public technique et exigeant — le
> message doit tenir sur le fond, pas sur le vernis. Source : webinar Notion ×
> Pennylane (`~/Vault/07-Research/Pennylane agents personnalises Notion (webinar).md`).

Ce qu'il a dit lui-même (à lui renvoyer, sans le survendre) :

- **Le mur niveau 2 → 3** : les solutions agentiques sont *single-player*, dures à
  dupliquer d'un poste à l'autre. « C'est là que les entreprises bloquent. »
- **Sa vision** : « on aimerait des agents qui sont là par défaut pour tout le monde,
  ils peuvent leur parler et ça a déjà tout le contexte » — des **skills partagés**,
  qu'il dit **« possible nulle part »** aujourd'hui (ni Notion).
- **Garbage in / garbage out** : « 2 tiers de mes agents servent à garder la donnée
  propre. » La qualité d'un agent = qualité de la donnée qu'on lui donne.
- **Gouvernance** : l'IT valide *le cadre* (connexions, ISO 27001), pas chaque agent.
- **Coûts** : coût max par agent / par employé, pas de machine à gaz.

Weave répond exactement à ces cinq points. Le pitch = **son cadre, notre runtime.**

---

## 1. Message d'accroche — LinkedIn (court)

> Bonjour Cyril,
>
> J'ai regardé votre webinar Notion × Pennylane. Deux choses m'ont marqué : le mur
> niveau 2 → 3 que vous décrivez (les skills restent *single-player*, dures à
> généraliser à une équipe), et votre vision — *« des agents disponibles par défaut,
> pour tout le monde, avec tout le contexte, sans que chacun recrée le sien »* — que
> vous dites impossible aujourd'hui, y compris sur Notion.
>
> C'est précisément ce qu'on construit avec **Weave** : un *Cognitive Runtime* qui
> **fait émerger des skills partagées** à partir de l'activité des équipes (Slack,
> Notion, GitHub…), avec **provenance par couche mémoire** (perso → équipe → projet →
> org), et **interrogeable en MCP** depuis vos agents Notion existants.
>
> 60 secondes pour voir l'idée 👉 [vidéo]. Je viens de l'ingénierie, pas du
> commercial — si vous m'accordez 15 min je déroule l'archi et vous la challengez.
>
> Guillaume

## 2. Message d'accroche — Email (avec crochet technique)

> **Objet :** Le niveau 3 « par défaut » — le chaînon manquant de votre webinar
>
> Bonjour Cyril,
>
> Votre passage sur le webinar Notion m'a interpellé, en particulier le moment où
> vous décrivez ce que vous *aimeriez* : des skills disponibles par défaut, partagées,
> avec tout le contexte — « possible nulle part » aujourd'hui. Et votre constat que
> 2 tiers de vos agents ne font que **garder la donnée propre**.
>
> Je construis **Weave**, un *Cognitive Runtime* qui attaque ces deux points de front :
>
> - Les **skills émergent toutes seules** des patterns récurrents de l'activité
>   (personne ne les écrit) et sont **promues au niveau org** → tout le monde en
>   profite sans recréer son agent. C'est le passage niveau 2 → 3, automatisé.
> - La **couche mémoire structure la donnée en continu** (faits atomiques, entités,
>   dédup, canonicalisation des sujets). Le *garbage-in* devient un pipeline, pas un
>   travail manuel de 400 agents de nettoyage.
> - **Gouvernance intégrée** : un agent spécialiste *émerge* d'un cluster de skills
>   mais reste **en attente d'approbation humaine** — votre modèle « l'IT cadre, pas
>   chaque agent ».
>
> Côté stack, c'est volontairement sobre : **Rust**, **une seule brique d'infra
> (Postgres + pgvector)**, ports & adapters. Retrieval hybride vecteur + full-text,
> routing par similarité cosine, orchestration plan → délègue → vérifie avec des
> garde-fous durs. Détail technique en pièce jointe (one-pager).
>
> Vidéo de 60s : [lien]. Produit live : strayeye.com.
>
> 15 min pour que vous challengiez l'archi ? Je viens avec le détail, pas un pitch.
>
> Guillaume — g.flambard@gmail.com

---

## 3. One-pager technique — comment Weave gère l'IA et la mémoire

*Niveau de détail calibré pour un Responsable IA. Tout est ancré dans le code
(`crates/`), valeurs réelles ci-dessous.*

### Principe d'architecture

Workspace **Rust**, **hexagonal (ports & adapters)**. **Une seule brique d'infra :
Postgres + pgvector.** Vecteurs (pgvector), full-text (tsvector), graphe (arêtes +
CTE récursive), bus (canal in-process). Chaque swap futur (Qdrant, Kuzu, NATS) = un
**adaptateur**, jamais une réécriture. Pas de zoo de services à opérer → coûts et
surface d'attaque prévisibles.

```
weave-core      types domaine purs (Event, Fact, Entity, Pattern, Skill, Agent)
weave-store     ports (traits) + adaptateur Postgres (pgvector, tsvector, graphe)
weave-llm       LlmGateway multi-provider + EmbeddingGateway
weave-pipeline  bus → étapes → pattern → skill → agent émergent + orchestrateur
weave-ingest    connectors (Slack, Notion) + dataset seed
weave-api       Axum : REST + SSE (live) + MCP
```

### A. Émergence des skills (le cœur — « personne ne les écrit »)

- **Mécanisme** : comptage d'occurrences par **signature de sujet**. Une skill se
  matérialise quand `occurrences ≥ seuil`. Seuil **configurable** (défaut code 5,
  réglé à **3** en démo) via `WEAVE_SKILL_THRESHOLD`.
- **Signature** : le `topic` du payload sert d'ancre stable, sinon **canonicalisation
  LLM via un vocabulaire contrôlé** → *les reformulations d'une même question comptent
  sur une seule signature* (résout le bruit du free-text). Namespacée par workstream.
- **Dédup** : `content_sig = SHA256(topic + content)` → pas de double comptage.
- **Corps de la skill** : synthétisé à partir des faits pertinents (recherche
  full-text `ts_rank`, k=12).
- *À noter* : **pas de clustering cosine ici** — pur comptage, déterministe et
  auditable. Le cosine sert au routing (§D), pas à l'émergence.

### B. Émergence des agents + gouvernance

- Les skills sont **clusterisées par `(équipe, thème)`**. Quand un cluster atteint le
  seuil (défaut **2**, `WEAVE_AGENT_EMERGE_THRESHOLD`), le LLM **synthétise l'identité
  de l'agent** (domaine, rôle, description).
- **Statut initial : `Pending`.** Un agent émergent **ne peut rien faire** tant qu'un
  humain ne l'approuve pas (`POST /agents/approve`). Seuls les agents `Active` sont
  délégables. → C'est votre modèle : **l'humain/IT cadre, la machine propose.**
- Idempotent par `(équipe, thème)` — pas de prolifération de doublons.

### C. Couches mémoire + provenance (votre « contexte par défaut »)

- **4 niveaux** : `personal → team → project → organization` (enum `MemoryLevel`).
- **Stockage** : colonnes `facts.memory_level`, `facts.team`, `facts.workstream` ;
  `skills.memory_level`. Une convention récurrente est **promue au niveau org** →
  disponible pour tous **sans recréer d'agent**.
- **Provenance sur `/ask`** : les faits utilisés sont **groupés par couche** et
  renvoyés ordonnés perso → équipe → projet → org (`LayerContext`). L'utilisateur voit
  *d'où vient chaque élément de réponse*. C'est votre « agents par défaut, avec tout
  le contexte » — rendu **traçable**.

### D. Retrieval hybride

- **Vecteur (pgvector)** : opérateur `<=>`, score = `1 − distance` cosine. Embeddings
  **768-dim** (`nomic-embed-text` via Ollama), **fallback hash déterministe** (offline,
  reproductible, souverain).
- **Full-text (tsvector)** : `plainto_tsquery` + `ts_rank`.
- **Fusion** : union **k=8 vecteur + k=8 full-text**, dédupliquée par id (pas de RRF —
  volontairement simple et lisible). Contextes spécialisés : k=6 vecteur pour une tâche
  agent, k=12 full-text pour la synthèse de skill.
- **Versioning** : filtre `superseded_by IS NULL` (soft-delete) → socle prêt pour la
  **détection de contradictions** et le time-travel (roadmap).

### E. Routing & orchestration

- **Routing** : on embed la tâche, puis pour chaque agent `Active` on embed son
  identité `(domaine + rôle + description)` et on prend le **cosine max si ≥ 0.35**
  (`ROUTE_MIN_SIMILARITY`). **Aucun keyword matching** → n'importe quel domaine émerge
  et devient routable, sans règles à maintenir.
- **Boucle plan → délègue → vérifie** :
  - *Plan* : récupère contexte + skills.
  - *Délègue* : si profondeur < 2 **et** budget temps restant → cherche un spécialiste.
  - *Vérifie* : un vérificateur valide la réponse ; sinon l'agent courant re-répond.
  - La **trace d'orchestration est affichée**.
- **Garde-fous durs** (non négociables, pour la prévisibilité coût/latence) :
  **profondeur ≤ 2**, **≤ 8 agents** par requête, **budget 180 s** total.

### F. LLM Gateway (multi-provider, souveraineté)

- `WEAVE_LLM_PROVIDER = ollama | claude | groq | openai | heuristic | auto`.
- **Fallback heuristique déterministe** : extraction + synthèse de skills + spec
  d'agent **sans aucune clé API** → éval reproductible, démo air-gapped, pas de
  dépendance dure à un fournisseur. `auto` prend Claude si clé, sinon Ollama local.
- Embeddings : Ollama par défaut, hash si Ollama injoignable (les deux → 768-dim
  L2-normalisés, interchangeables pour le cosine).

### G. Interop — MCP

- Endpoint **`POST /mcp`** (`ask_memory`) : **n'importe quel agent externe** (un agent
  Notion, Claude Desktop, un IDE…) interroge la mémoire Weave. Weave **n'est pas un
  silo de plus** — c'est la couche mémoire *derrière* vos outils existants. Vous gardez
  Notion ; Weave rend ses agents plus intelligents.

---

## 4. Mapping webinar → Weave (anticiper ses objections)

| Ce que Cyril a dit | Réponse Weave |
|---|---|
| Skills *single-player*, mur niveau 2→3 | Émergence + promotion **niveau org** → niveau 3 par défaut, sans recréer d'agent |
| « 2/3 de mes agents nettoient la donnée » | La **couche mémoire structure en continu** (faits, entités, dédup, canonicalisation) — pipeline, pas travail manuel |
| « agents par défaut, avec tout le contexte » | **Couches mémoire + provenance** sur `/ask`, interrogeables en MCP |
| L'IT cadre, ne valide pas chaque agent | Agents émergents **`Pending` → approval gate** : cadre humain, proposition machine |
| Prédictabilité des coûts | **Postgres-only**, garde-fous durs (180s, 8 agents, profondeur 2), fallback sans clé |
| « je reste sur Notion, c'est simple » | Weave **ne remplace pas Notion** — MCP le branche par-dessous |

**Angle de clôture** : « Vous avez décrit le niveau 3 comme un objectif qu'on atteint
péniblement, personne par personne. Weave le rend *émergent* : il naît du travail de
l'équipe, avec gouvernance. Je ne vends pas un agent de plus — je vends le runtime en
dessous. »
