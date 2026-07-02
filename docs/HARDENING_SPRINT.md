# Weave — Hardening Sprint (2 semaines)

## Objectif
Faire passer `weave` de **démo forte** à **prototype durci et crédible pour pilote encadré**.

---

## Semaine 1 — Backend/API hardening

### Jour 1 — Corriger le scoping API
- [x] Auditer tous les handlers de `weave/crates/weave-api/src/main.rs`
- [x] Corriger `approve_agent` pour utiliser un `project` explicite
- [x] Corriger `/reset` pour permettre un reset scoped par projet
- [x] Revoir `/ingest/slack` :
  - [x] soit ajouter `project`
  - [ ] soit le marquer explicitement “mode démo”
- [x] Vérifier la cohérence `DEFAULT_PROJECT` vs query param vs body JSON
- [x] Vérifier que toutes les routes mutatives utilisent le bon scope projet
- [x] Lancer `cargo check`
- [ ] Tester les routes corrigées manuellement avec `curl`

**Done when:**
- aucune route critique n’agit par erreur sur `DEFAULT_PROJECT`

---

### Jour 2 — Ajouter une sécurité API minimale
- [x] Restreindre CORS via configuration
- [x] Ajouter une auth simple pour l’API
  - [x] `Authorization: Bearer ...` ou `X-API-Key`
- [x] Protéger les routes mutatives :
  - [x] `/reset`
  - [x] `/org/load`
  - [x] `/org` `PUT`
  - [x] `/simulate`
  - [x] `/inject`
  - [x] `/agents/approve`
  - [x] `/agents/run`
  - [x] `/ingest/slack`
  - [x] `/mcp` si nécessaire
- [x] Ne plus renvoyer les erreurs internes brutes au client
- [ ] Vérifier qu’une requête sans auth échoue
- [ ] Vérifier qu’une requête avec auth réussit

**Done when:**
- les endpoints critiques ne sont plus publics
- les erreurs 500 ne leakent plus de détails internes

---

### Jour 3 — Ajouter des tests d’intégration `PgStore`
- [x] Créer une suite de tests d’intégration DB
- [x] Tester les migrations
- [x] Tester `insert_event` + dédup
- [x] Tester `reset(project)`
- [ ] Tester `insert_fact` + `recent_facts`
- [x] Tester `observe` sur les patterns
- [x] Tester `insert_skill` + unicité
- [x] Tester `insert_agent` + `set_agent_status`
- [x] Tester `save_org_config` + `get_org_config`
- [x] Documenter comment lancer les tests DB

**Done when:**
- les chemins critiques du store concret sont couverts

---

### Jour 4 — Ajouter des tests API Axum
- [x] Créer une suite de tests API
- [x] Tester `/health`
- [ ] Tester `/stats`
- [ ] Tester `/facts`
- [ ] Tester `/skills`
- [ ] Tester `/ask`
- [ ] Tester `/agents`
- [x] Tester `/agents/approve`
- [x] Tester `/reset`
- [ ] Tester `/inject`
- [x] Vérifier les status codes
- [x] Vérifier les JSON de réponse
- [x] Vérifier auth + scoping projet

**Done when:**
- les endpoints principaux sont validés automatiquement

---

### Jour 5 — Fiabiliser le feedback frontend
- [ ] Supprimer les `catch {}` silencieux du flow principal
- [ ] Ajouter un message d’erreur visible dans l’UI
- [ ] Ajouter état pending pour :
  - [ ] `simulate`
  - [ ] `reset`
  - [ ] `ask`
  - [ ] `inject`
  - [ ] `approveAgent`
  - [ ] `switchOrg`
- [ ] Gérer explicitement le cas API hors ligne
- [ ] Vérifier le comportement frontend si l’API retourne 500

**Done when:**
- une erreur réseau ou backend est visible et compréhensible côté UI

---

## Semaine 2 — Frontend structure + validation + CI

### Jour 6 — Extraire le data layer frontend
- [x] Créer `weave/apps/web/lib/api.ts`
- [x] Créer `weave/apps/web/lib/types.ts`
- [x] Créer `weave/apps/web/hooks/use-weave-dashboard.ts`
- [ ] Créer `weave/apps/web/hooks/use-weave-events.ts` si utile
- [x] Déplacer les appels `fetch` dans `api.ts`
- [x] Déplacer les types locaux hors de `page.tsx`
- [x] Réduire significativement la taille de `page.tsx`
- [ ] Vérifier que le comportement reste identique

**Done when:**
- le réseau et les types ne vivent plus dans `page.tsx`

---

### Jour 7 — Extraire les composants UI
- [ ] Créer `TopBar`
- [ ] Créer `ScopeBar`
- [ ] Créer `FeedPanel`
- [ ] Créer `MemoryPanel`
- [ ] Créer `SkillsPanel`
- [ ] Créer `AgentsPanel`
- [ ] Créer `AskPanel`
- [ ] Laisser `page.tsx` comme composition de haut niveau
- [ ] Vérifier que le rendu final n’a pas régressé

**Done when:**
- `page.tsx` devient un orchestrateur de page, plus un monolithe

---

### Jour 8 — Ajouter un test E2E du flow principal
- [x] Installer/configurer Playwright
- [ ] Écrire un scénario principal :
  - [x] ouvrir l’app
  - [ ] charger preset
  - [ ] simuler l’activité
  - [ ] attendre une skill émergée
  - [ ] poser une question
  - [ ] vérifier réponse + provenance
- [x] Ajouter éventuellement un smoke test secondaire
- [x] Documenter comment lancer les E2E

**Done when:**
- le flow principal de la démo est validé automatiquement

---

### Jour 9 — Ajouter une CI minimale
- [x] Ajouter workflow CI
- [x] Lancer `cargo check`
- [x] Lancer `cargo test`
- [x] Lancer build frontend
- [x] Ajouter tests API/intégration si possible
- [ ] Ajouter smoke E2E si l’environnement le permet
- [ ] Vérifier qu’un échec bloque bien la pipeline

**Done when:**
- chaque changement important passe par une validation automatique minimale

---

### Jour 10 — Observabilité légère + docs alignées
- [x] Ajouter des logs plus explicites sur :
  - [x] `reset`
  - [x] `simulate`
  - [x] `inject`
  - [x] `ask`
  - [x] `approve_agent`
  - [x] `run_agent`
- [x] Mettre à jour `README.md`
- [ ] Mettre à jour la doc d’audit si besoin
- [x] Documenter :
  - [x] mode auth
  - [x] variables d’environnement
  - [x] lancement tests
  - [x] flow de validation
  - [ ] limites restantes connues

**Done when:**
- un autre dev peut lancer le projet et comprendre l’état réel du système

---

# Top 5 priorités absolues
Si le temps manque :

- [x] Corriger le scoping API
- [x] Ajouter auth + CORS minimum
- [x] Ajouter tests d’intégration `PgStore`
- [x] Ajouter tests API
- [ ] Rendre les erreurs frontend visibles

---

# Critères de succès fin de sprint

## Backend/API
- [ ] plus de route critique hardcodée sur `DEFAULT_PROJECT`
- [ ] auth minimale en place
- [ ] CORS restreint
- [ ] erreurs internes non exposées brut
- [x] tests store/API verts

## Frontend
- [ ] plus de `catch {}` silencieux sur le flow principal
- [ ] feedback d’erreur visible
- [x] `page.tsx` nettement allégé
- [x] composants/hooks extraits

## Validation
- [ ] flow E2E principal passe
- [x] smoke E2E configuré
- [ ] CI minimale verte
- [x] workflow CI minimal ajouté

## Produit
- [ ] démo toujours fluide
- [x] docs réalignées avec l’état réel

---

# Risques à éviter
- [ ] ne pas sur-refactorer le frontend trop tôt
- [ ] ne pas perdre 3 jours sur une auth trop lourde
- [ ] ne pas repousser les tests DB/API au profit de tâches plus “visibles”
- [ ] ne pas casser la démo pendant le refactor sans filet de validation
