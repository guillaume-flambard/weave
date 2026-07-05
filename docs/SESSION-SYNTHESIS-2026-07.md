# Weave — Synthèse de travail (juillet 2026)

**Produit :** Weave — *Cognitive Runtime* MVP. Construit la mémoire d'une organisation à
partir de son activité réelle (Slack, Notion) : événements → faits → schémas → **compétences**
→ **agents spécialistes** émergents, écrits dans Notion. Cible pitch : PennyLane (évaluateur
**Cyril Allard**, New Business Lead & Responsable IA).

**Live :** https://strayeye.com — Rust API + Next.js + Postgres (pgvector), tout Docker, isolé,
sur VPS OVH (Forge). LLM = **Groq** (`llama-3.3-70b`). Auto-deploy sur push `main`.

---

## Ce qui a été livré cette session

### 1. Déploiement prod (chantier 1)
Stack dockerisé sur strayeye.com via Forge API. Cert **Let's Encrypt** réel (certbot webroot),
Cloudflare Full(strict). nginx → Next.js → proxy `/weave-api` → Rust. Migrations auto au boot.
Isolé d'echotravel (même VPS). Bugs réglés : sharp/pnpm, `WEAVE_API_PROXY` figé au build,
dir `public` manquant pour LE.

### 2. OAuth Slack + Notion (multi-tenant, chiffré)
- Vrai OAuth pour **Slack** et **Notion** — chaque utilisateur connecte **son** workspace.
- Tokens **chiffrés au repos** (ChaCha20-Poly1305). `GET /connections` (statut réel),
  callback → redirect UI, flash succès/erreur. Bouton **Connect / Sync / Déconnecter**.
- Notion : connexion **publique OAuth** créée (client_id/secret) — pas le token interne.
- Slack : **user token** (`user_scope`) → lit les canaux de l'utilisateur.

### 3. Ingest Slack multi-canal (canaux de l'utilisateur)
`SlackConnector::poll_all` découvre les **canaux publics** de l'utilisateur connecté
(`users.conversations`, `channels:read`) et ingère leur historique (best-effort par canal,
plafonds 15 canaux × 50 msg). Plus de `SLACK_CHANNEL` hardcodé. Multi-tenant : Cyril → ses canaux.

### 4. Notion write-back (agents → Notion)
À l'**approbation** d'un agent, écriture dans une database **"Weave Agents"** (créée sous une
page de l'utilisateur), idempotent par `WeaveId`, best-effort. Vérifié live.

### 5. Émergence d'agents riches, sans hardcode
Supprimé `classify_domain` (6 domaines keyword). Chaque skill reçoit un **thème LLM libre** ;
agents clusterisés par `(équipe, thème)` avec **nom/rôle/description synthétisés** ; routing par
**similarité d'embedding**. Vérifié live (8 agents riches émergés).

### 6. Données structurées (I/O LLM + inputs)
- **Sorties** : JSON strict + `parse_json_lenient` (tolérant), **vocabulaire de domaines
  contrôlé** (réutilise les domaines existants → consolidation), normalisation (`normalize_theme`,
  `slug`), validation.
- **Entrées** : extract via parse robuste ; **dédup des faits** (`content_sig`, index unique
  partiel) ; canonicalisation des entités. → donnée propre bout-en-bout (exigence PennyLane).

**Qualité :** ~65 tests / 0 échec / 0 warning (DB fraîche, serial), tsc + next build OK.
Méthode : brainstorm → spec → plan → build TDD (docs/superpowers/specs & plans).

---

## Architecture (bout-en-bout)
```
Slack/Notion (OAuth, token chiffré) → ingest (canaux du user)
  → extract (Groq, JSON robuste) → faits (trimés, dédupliqués)
  → schémas → skills → thème (vocab contrôlé)
  → agents riches (nom/rôle/desc synthétisés, pending)
  → approbation → écrits dans Notion
```

## Reste à faire (backlog — voir Linear)
- 🟡 Vérifier ingest Slack sur un **vrai workspace** (Cyril, ou données de test).
- 🟠 Seuil d'émergence → 2 (moins de bruit, thèmes consolidés).
- 🟠 **Embedder sémantique** réel (Groq n'a pas d'embeddings → routing en hash).
- 🟠 Canonicalisation des **topics** de faits (dédup sémantique).
- 🟡 Passe **UX** du parcours + UI agents (statut Notion).
- 🔵 **Tests Postgres parallel-safe** (suite api = 5 min, serial → vrai frein dev).
- 🔵 Canaux Slack **privés** (`groups:read` + reconnexion).

Sécu : Guillaume OK avec les clés exposées en session (pas de régénération demandée).
