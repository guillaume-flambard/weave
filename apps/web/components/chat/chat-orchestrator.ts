import type { ParsedIntent } from "./types";

const ASK_KEYWORDS = /synchro|bancaire|oauth|bridge|webhook|fec|onboarding|funnel|branche|nommage|kebab|comment|pourquoi|quelle|quel|comment\s+on/i;

export type SlashCommandDef = {
  id: string;
  prefix: string;
  aliases: string[];
  labelKey: string;
  descKey: string;
  /** Text inserted when the command is picked */
  template: string;
  /** Hidden from the slash menu (still parseable if typed). Keeps the demo path
   * to a few obvious actions; admin/dashboard commands stay reachable but unadvertised. */
  hidden?: boolean;
};

export const SLASH_COMMANDS: SlashCommandDef[] = [
  { id: "sources", prefix: "sources", aliases: ["connect"], labelKey: "chat.cmdSources", descKey: "chat.cmdSourcesDesc", template: "/sources" },
  { id: "simulate", prefix: "simulate", aliases: ["ingest"], labelKey: "chat.cmdSimulate", descKey: "chat.cmdSimulateDesc", template: "/simulate" },
  { id: "ask", prefix: "ask", aliases: [], labelKey: "chat.cmdAsk", descKey: "chat.cmdAskDesc", template: "/ask " },
  { id: "agents", prefix: "agents", aliases: [], labelKey: "chat.cmdAgents", descKey: "chat.cmdAgentsDesc", template: "/agents" },
  { id: "memory", prefix: "memory", aliases: [], labelKey: "chat.cmdMemory", descKey: "chat.cmdMemoryDesc", template: "/memory", hidden: true },
  { id: "overview", prefix: "overview", aliases: [], labelKey: "chat.cmdOverview", descKey: "chat.cmdOverviewDesc", template: "/overview", hidden: true },
  { id: "govern", prefix: "govern", aliases: ["governance"], labelKey: "chat.cmdGovern", descKey: "chat.cmdGovernDesc", template: "/govern", hidden: true },
  { id: "scope", prefix: "scope", aliases: [], labelKey: "chat.cmdScope", descKey: "chat.cmdScopeDesc", template: "/scope ", hidden: true },
  { id: "help", prefix: "help", aliases: [], labelKey: "chat.cmdHelp", descKey: "chat.cmdHelpDesc", template: "/help" },
];

/** Returns filtered commands when the input is an in-progress slash command (e.g. `/` or `/sim`). */
export function filterSlashCommands(input: string): SlashCommandDef[] {
  if (!input.startsWith("/")) return [];
  if (/\s/.test(input.slice(1))) return [];
  const query = input.slice(1).toLowerCase();
  const pool = SLASH_COMMANDS.filter((c) => !c.hidden);
  if (!query) return pool;
  return pool.filter((c) => {
    if (c.prefix.startsWith(query)) return true;
    return c.aliases.some((a) => a.startsWith(query));
  });
}

export function isSlashMenuOpen(input: string): boolean {
  if (!input.startsWith("/")) return false;
  if (/\s/.test(input.slice(1))) return false;
  const trimmed = input.trim();
  if (SLASH_COMMANDS.some((c) => c.template.trim() === trimmed)) return false;
  return true;
}

const SLASH: Record<string, ParsedIntent["kind"]> = {
  connect: "sources",
  sources: "sources",
  simulate: "simulate",
  ingest: "simulate",
  agents: "agents",
  memory: "memory",
  overview: "overview",
  govern: "govern",
  governance: "govern",
  help: "help",
};

export function parseChatInput(raw: string): ParsedIntent {
  const text = raw.trim();
  if (!text) return { kind: "help" };

  if (text.startsWith("/")) {
    const parts = text.slice(1).split(/\s+/);
    const cmd = parts[0]?.toLowerCase() ?? "";
    const rest = parts.slice(1).join(" ").trim();

    if (cmd === "ask" && rest) return { kind: "ask", question: rest };
    if (cmd === "scope" && rest) return { kind: "scope", team: rest };

    const mapped = SLASH[cmd];
    if (mapped === "ask") return { kind: "ask", question: rest || "Comment relancer la synchro bancaire d'un client ?" };
    if (mapped) return { kind: mapped } as ParsedIntent;
    return { kind: "help" };
  }

  if (ASK_KEYWORDS.test(text) && text.includes("?")) {
    return { kind: "ask", question: text };
  }

  if (text.length > 8 && (text.endsWith("?") || ASK_KEYWORDS.test(text))) {
    return { kind: "ask", question: text };
  }

  return { kind: "freeform", text };
}

export function intentLabel(intent: ParsedIntent): string {
  switch (intent.kind) {
    case "sources": return "/sources";
    case "simulate": return "/simulate";
    case "ask": return `/ask ${intent.question}`;
    case "agents": return "/agents";
    case "memory": return "/memory";
    case "overview": return "/overview";
    case "govern": return "/govern";
    case "scope": return `/scope ${intent.team}`;
    case "help": return "/help";
    case "freeform": return intent.text;
  }
}
