export type ConnectorStatus = "connected" | "error" | "disconnected" | "add";
export type ConnectorTier = "primary" | "secondary";

export type Connector = {
  id: string;
  name: string;
  role: string;
  items: string;
  lastSync: string;
  itemsLabel: string;
  team: string;
  things: string[];
  tier: ConnectorTier;
};

const PENNYLANE_GITHUB_THINGS = ["pennylane/api", "pennylane/web", "pennylane/bridge-sync"];
const ACME_GITHUB_THINGS = ["acme/api", "acme/web", "acme/bridge-sync"];

type BaseConnector = {
  id: string;
  name: string;
  role: string;
  items: string;
  lastSync: string;
  itemsLabel: string;
  team: string;
  things: string[];
  thingsByOrg?: Record<string, string[]>;
};

const BASE_CONNECTORS: BaseConnector[] = [
  {
    id: "slack",
    name: "Slack",
    role: "Questions & réponses des canaux d'équipe",
    items: "1 240 messages lus",
    lastSync: "il y a 4 min",
    itemsLabel: "Canaux à lire",
    team: "data",
    things: ["#data", "#growth", "#produit", "#support", "#général"],
  },
  {
    id: "notion",
    name: "Notion",
    role: "Décisions & documentation d'équipe",
    items: "24 pages lues",
    lastSync: "il y a 12 min",
    itemsLabel: "Espaces à lire",
    team: "produit",
    things: ["Espace Data", "Espace Produit", "Espace Growth"],
  },
  {
    id: "discord",
    name: "Discord",
    role: "Questions & réponses des salons d'équipe",
    items: "",
    lastSync: "",
    itemsLabel: "Salons à lire",
    team: "tech",
    things: ["#general", "#tech", "#web-general"],
  },
  {
    id: "github",
    name: "GitHub",
    role: "Pull requests, issues, revues de code",
    items: "3 dépôts",
    lastSync: "",
    itemsLabel: "Dépôts à lire",
    team: "data",
    things: PENNYLANE_GITHUB_THINGS,
    thingsByOrg: { pennylane: PENNYLANE_GITHUB_THINGS, acme: ACME_GITHUB_THINGS },
  },
  {
    id: "gdocs",
    name: "Google Docs",
    role: "Notes & comptes-rendus de réunion",
    items: "",
    lastSync: "",
    itemsLabel: "Dossiers à lire",
    team: "growth",
    things: ["Drive · Comptes-rendus", "Drive · Specs produit"],
  },
  {
    id: "linear",
    name: "Linear",
    role: "Tickets & specs produit",
    items: "",
    lastSync: "",
    itemsLabel: "Équipes à lire",
    team: "produit",
    things: ["Équipe Produit", "Équipe Growth"],
  },
  {
    id: "other",
    name: "Autre source",
    role: "Webhook ou API personnalisée",
    items: "",
    lastSync: "",
    itemsLabel: "",
    team: "data",
    things: [],
  },
];

type OrgProfile = {
  tiers: Record<string, ConnectorTier>;
  status: Record<string, ConnectorStatus>;
};

const PENNYLANE_PROFILE: OrgProfile = {
  tiers: {
    slack: "primary",
    notion: "primary",
    discord: "primary",
    github: "secondary",
    gdocs: "secondary",
    linear: "secondary",
    other: "secondary",
  },
  status: {
    slack: "connected",
    notion: "connected",
    discord: "disconnected",
    github: "disconnected",
    gdocs: "disconnected",
    linear: "disconnected",
    other: "add",
  },
};

const ACME_PROFILE: OrgProfile = {
  tiers: {
    slack: "primary",
    notion: "primary",
    discord: "primary",
    github: "secondary",
    gdocs: "secondary",
    linear: "secondary",
    other: "secondary",
  },
  status: {
    slack: "connected",
    notion: "connected",
    discord: "disconnected",
    github: "error",
    gdocs: "disconnected",
    linear: "disconnected",
    other: "add",
  },
};

const DEFAULT_PROFILE = PENNYLANE_PROFILE;

function profileForOrg(orgId: string): OrgProfile {
  if (orgId === "acme") return ACME_PROFILE;
  return DEFAULT_PROFILE;
}

function buildConnector(
  base: BaseConnector,
  orgId: string,
  profile: OrgProfile,
): Connector {
  const things = base.thingsByOrg?.[orgId] ?? base.things;
  return {
    id: base.id,
    name: base.name,
    role: base.role,
    items: base.items,
    lastSync: base.lastSync,
    itemsLabel: base.itemsLabel,
    team: base.team,
    things,
    tier: profile.tiers[base.id] ?? "secondary",
  };
}

/** @deprecated Use connectorsForOrg */
export const CONNECTORS: Connector[] = connectorsForOrg("pennylane");

export function connectorsForOrg(orgId: string): Connector[] {
  const profile = profileForOrg(orgId);
  return BASE_CONNECTORS.map((base) => buildConnector(base, orgId, profile));
}

export function primaryConnectors(orgId: string): Connector[] {
  return connectorsForOrg(orgId).filter((c) => c.tier === "primary");
}

export function secondaryConnectors(orgId: string): Connector[] {
  return connectorsForOrg(orgId).filter((c) => c.tier === "secondary");
}

export function defaultConnectorStatus(id: string, orgId = "pennylane", empty = false): ConnectorStatus {
  if (empty) return id === "other" ? "add" : "disconnected";
  const profile = profileForOrg(orgId);
  return profile.status[id] ?? "disconnected";
}

export function summaryConnectors(orgId = "pennylane"): Connector[] {
  return primaryConnectors(orgId);
}
