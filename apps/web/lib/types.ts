export type Feed = {
  /** Client-side stable key stamped at ingestion, so streamed rows don't re-mount
   *  (and re-fire their entrance animation) when the newest-first list shifts. */
  _k?: number;
  type: string;
  source?: string;
  actor?: string;
  text?: string;
  ftype?: string;
  author?: string;
  topic?: string;
  content?: string;
  memory_level?: string;
  name?: string;
  sources_count?: number;
  skills?: string[];
  domain?: string;
  signature?: string;
  occurrences?: number;
  threshold?: number;
  src?: string;
  dst?: string;
  rel?: string;
  batch_size?: number;
  inserted?: number;
};

export type Skill = {
  id: string;
  name: string;
  team: string;
  workstream: string;
  trigger: string;
  body: string;
  referents: string[];
  sources: string[];
  memory_level: string;
};

export type Fact = {
  id: string;
  ftype: string;
  author: string;
  team: string;
  workstream: string;
  topic: string;
  content: string;
  memory_level: string;
};

export type Layer = {
  level: string;
  facts: { content: string; author: string; ftype: string }[];
};

export type Answer = {
  answer: string;
  skill_used: string | null;
  layers: Layer[];
};

export type Agent = {
  id: string;
  name: string;
  team: string;
  role: string;
  domain: string;
  skills: string[];
  status: string;
  derived_from: string;
};

export type TraceStep = {
  agent: string;
  action: string;
  note: string;
  depth: number;
};

export type AgentRun = {
  answer: string;
  trace: TraceStep[];
};

export type Project = {
  name: string;
  theme: string;
  domain: string;
};

export type TeamCfg = {
  name: string;
  members: string[];
  projects: Project[];
};

export type OrgCfg = {
  org: string;
  name: string;
  teams: TeamCfg[];
};

export type WeaveStats = {
  events: number;
  facts: number;
  entities: number;
  relationships: number;
  skills: string[];
  agents: { name: string; status: string }[];
  llm?: string;
};
