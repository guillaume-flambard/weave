# Weave — TODO préparation UI pour refonte Claude Code / Next.js 15

## Objectif
Préparer un terrain propre pour une future refonte UI pilotée avec Claude Code, en gardant :
- une structure frontend stable et scalable
- des composants réutilisables
- des primitives de design claires
- des patterns conformes aux bonnes pratiques Next.js 15
- une séparation nette entre logique produit, rendu UI, et variantes visuelles

---

## Principes de base
- garder `app/` minimal : routing, layout, composition de page
- pousser les composants UI dans `components/`
- pousser la logique interactive dans `hooks/`
- pousser les appels réseau dans `lib/`
- éviter les composants monolithes et les prop-drilling trop profonds
- créer des primitives visuelles réutilisables avant de créer des sections de page complexes
- préparer le terrain pour que Claude puisse remplacer le visuel sans casser la logique

---

## Checklist — structure cible frontend

### 1. Architecture des dossiers
- [ ] Créer une structure de dossiers plus explicite dans `apps/web/components/`
  - [ ] `components/primitives/`
  - [ ] `components/layout/`
  - [ ] `components/dashboard/`
  - [ ] `components/feedback/`
- [ ] Déplacer les composants actuels dans des sous-dossiers cohérents
- [ ] Garder `page.tsx` comme orchestrateur léger
- [ ] Vérifier que les imports restent simples et lisibles

### 2. Primitives UI réutilisables
- [ ] Créer des primitives réutilisables pour éviter le copy/paste de classes Tailwind
  - [ ] `Button`
  - [ ] `Panel`
  - [ ] `Badge`
  - [ ] `Input`
  - [ ] `SectionHeader`
  - [ ] `EmptyState`
- [ ] Remplacer les classes dupliquées par ces primitives
- [ ] Prévoir des variantes (`primary`, `secondary`, `danger`, `ghost`)
- [ ] Prévoir des états (`loading`, `disabled`, `error`)

### 3. Tokens et design system minimal
- [ ] Formaliser les tokens existants de `globals.css`
- [ ] Documenter les familles de tokens
  - [ ] couleurs
  - [ ] bordures
  - [ ] rayons
  - [ ] ombres
  - [ ] espacements
  - [ ] animations
- [ ] Définir des conventions de nommage stables
- [ ] Préparer un mini guide pour que Claude ne réintroduise pas du style inline incohérent

### 4. Next.js 15 best practices
- [ ] Vérifier quels composants peuvent redevenir Server Components
- [ ] Limiter `"use client"` aux surfaces strictement interactives
- [ ] Garder les hooks client près des composants qui en ont besoin
- [ ] Éviter de transformer toute la page en client component si non nécessaire
- [ ] Revoir les warnings Next actuels
  - [ ] lockfiles multiples / root inference
  - [ ] `allowedDevOrigins`
- [ ] Ajouter une config Next propre si nécessaire (`next.config.mjs`)

### 5. Séparation logique / présentation
- [ ] Isoler davantage les primitives d’affichage des données dashboard
- [ ] Vérifier que les composants visuels n’appellent pas directement l’API
- [ ] Garder `useWeaveDashboard` comme façade métier principale
- [ ] Réévaluer plus tard si `use-weave-events.ts` devient utile

### 6. Accessibilité et testabilité
- [ ] Stabiliser les sélecteurs de test avec `data-testid` seulement là où utile
- [ ] Vérifier les rôles accessibles des boutons, inputs, headings
- [ ] Vérifier les libellés de contrôles clés
- [ ] Conserver le smoke E2E pendant la refonte

### 7. Préparation Claude Code
- [ ] Écrire un brief clair de refonte UI avant génération
- [ ] Lister ce qui est figé vs libre
  - [ ] logique API
  - [ ] structure mémoire / skills / agents
  - [ ] hiérarchie produit
  - [ ] copy révisable
  - [ ] style visuel libre
- [ ] Définir les composants “contrat produit” que Claude ne doit pas casser
- [ ] Préparer un plan de migration section par section au lieu d’un big bang si possible

---

## Cibles concrètes recommandées

### Structure possible
```text
apps/web/
  app/
    layout.tsx
    page.tsx
  components/
    primitives/
      Button.tsx
      Panel.tsx
      Badge.tsx
      Input.tsx
      SectionHeader.tsx
      EmptyState.tsx
    layout/
      TopBar.tsx
      ScopeBar.tsx
    dashboard/
      FeedPanel.tsx
      MemoryPanel.tsx
      SkillsPanel.tsx
      AgentsPanel.tsx
      AskPanel.tsx
    feedback/
      ErrorBanner.tsx
      FlashBanner.tsx
  hooks/
    use-weave-dashboard.ts
  lib/
    api.ts
    types.ts
```

---

## Ordre conseillé
1. introduire primitives UI
2. ranger les composants par sous-domaine
3. extraire bannières / feedback
4. nettoyer `page.tsx`
5. traiter warnings Next 15
6. seulement ensuite lancer une refonte visuelle plus ambitieuse avec Claude

---

## Non-objectifs pour l’instant
- ne pas reconstruire le flow E2E complet sur l’ancienne UI
- ne pas sur-extraire la logique SSE tant que ce n’est pas justifié
- ne pas changer la logique métier backend pour des raisons purement visuelles
