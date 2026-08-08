// Subtitle chunks per scene (burned-in, for muted autoplay).
// Each scene's chunks are distributed proportionally across its VO duration.
export const CAPTIONS: Record<string, string[]> = {
  s1: ["Chez Pennylane,", "plus de 400 agents IA.", "Un par personne. Un par tâche."],
  s2: [
    "Mais chaque agent vit seul.",
    "Impossible de partager une compétence",
    "à toute une équipe.",
    "Sans données propres, l'agent répond n'importe quoi.",
  ],
  s3: [
    "L'idéal ?",
    "Des compétences par défaut.",
    "Pour tout le monde.",
    "Avec tout le contexte — sans recréer son agent.",
  ],
  s4: [
    "Weave, c'est exactement ça.",
    "Un Cognitive Runtime.",
    "Les compétences émergent, se partagent,",
    "et vivent là où vos équipes travaillent.",
    "Slack. Discord. Notion.",
    "Une mémoire commune. Un contexte partagé.",
  ],
  s5: ["Le niveau 3. Par défaut.", "Voici Weave en action.", "Parlons-en."],
};
