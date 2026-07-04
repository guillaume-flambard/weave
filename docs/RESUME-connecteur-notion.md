# Résumé — Connecteur Notion réel (2026-07-03)

**Livré sur `main` (`ec364bf`).** But démo Cyril/PennyLane : connecter le vrai Slack + Notion et synchroniser dans Weave.

## Fait
- **Connecteur Notion réel** (`crates/weave-ingest/src/notion.rs`) : lit pages (texte des blocs) + rows de databases (titre + résumé des propriétés) via un token d'intégration `NOTION_TOKEN`. Calqué sur `SlackConnector`.
- **`ingest_notion`** : token présent → ingestion réelle ; sinon → repli seed (démo offline intacte).
- Slack sans token = `not_configured` (pas de seed). Scope optionnel : `NOTION_PAGE_IDS` / `NOTION_DATABASE_IDS`.
- **Résultat** : Slack réel + Notion réel via tokens env.

## Méthode
6 tâches TDD (subagent-driven : implementer + reviewer par tâche, revue finale). Gate : **26 tests / 0 échec / 0 warning** (serial, DB propre). WIP pré-existant commité en baselines propres (`e28060d`, `d92a2bc`) avant le connecteur.

Spec + plan : `docs/superpowers/`.

## Reste de l'arc live-OAuth (ordre 3→4→5→1)
- ✅ **3** Connecteur Notion réel
- ⬜ **4** Flux OAuth + stockage token chiffré (localhost d'abord)
- ⬜ **5** UI connect réelle
- ⬜ **2** Enregistrer apps Slack/Notion — **Guillaume** (comptes/secrets)
- ⬜ **1** Déploiement domaine public — en dernier

## Dettes notées
- Tests Postgres non parallel-safe → `--test-threads=1` + DB propre (tâche de fond ouverte).
- Branche `poll()` live sans test auto (réseau, hors-scope planifié).

**Prochain : chantier 4 (OAuth).**
