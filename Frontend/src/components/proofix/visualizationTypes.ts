/**
 * Typed payloads consumed by `AgentVisualization`. Each agent's visualization
 * renders entirely from one of these shapes — no inline literals.
 *
 * Backed today by the mock fixtures attached to `AgentEntry.visualization`
 * in `data.ts`. A backend implementation should serialize these shapes
 * verbatim per agent.
 */

export interface RepoFile {
  name: string;
  ast: number;
}

export interface RepoIntelPayload {
  files: RepoFile[];
  graphNodes: number;
  metrics: {
    files: number;
    astNodes: number;
    imports: number;
    dependencies: number;
    semanticRoles: number;
  };
}

export interface DepNode {
  name: string;
  sub: string;
}
export interface DepDeadNode {
  name: string;
}
export interface DepsPayload {
  path: DepNode[];
  unreachable: DepDeadNode[];
  metrics: {
    reachable: number;
    deadFindings: number;
    attackPaths: number;
  };
}

export type FindingSeverity = "HIGH" | "MEDIUM" | "LOW";
export interface StaticFinding {
  sev: FindingSeverity;
  text: string;
  at: number;
}
export interface StaticPayload {
  scanners: string[];
  findings: StaticFinding[];
  metrics: {
    raw: number;
    deduped: number;
    prioritized: number;
  };
}

export type PytestResult = "PASS" | "FAIL";
export interface PytestEntry {
  name: string;
  result: PytestResult;
}
export interface ReproducePayload {
  command: string;
  tests: PytestEntry[];
  failure: {
    name: string;
    assertion: string;
    expected: string;
    actual: string;
    stack: string[];
  };
  successMessage: string;
}

export interface RootLine {
  code: string;
  probe: string;
}
export interface RootEvidence {
  n: number;
  title: string;
  detail: string;
  conf: number;
}
export interface RootCausePayload {
  lines: RootLine[];
  bugMessage: string;
  evidence: RootEvidence[];
}

export interface BlastModule {
  name: string;
  hitAt: number;
}
export interface BlastPayload {
  source: string;
  modules: BlastModule[];
}

export interface DAGNode {
  id: string;
  label: string;
  x: number;
  y: number;
}
export interface PlannerPayload {
  nodes: DAGNode[];
  edges: [number, number][];
}

export type PatchOp = "ctx" | "del";
export interface PatchLine {
  t: string;
  op: PatchOp;
}
export interface PatchPayload {
  thoughts: string[];
  original: PatchLine[];
  generated: string;
  badges: string[];
}

export interface Mutant {
  id: number;
  killed: boolean;
  label: string;
}
export interface MutationPayload {
  mutants: Mutant[];
  threshold: number;
  failureMessage: string;
}

export interface MergeMetric {
  label: string;
  value: number;
  ok: boolean;
  /** When supplied, the value renders as a label (e.g. "Low") once the count-up reaches it. */
  scopeLabel?: string;
}
export interface MergePayload {
  metrics: MergeMetric[];
  /** Weights applied to first three numeric metrics for the composite gauge. */
  weights: [number, number, number];
  decisionLabel: string;
  reviewNote: string;
}

export type AgentVisualizationPayload =
  | { kind: "repo-intel"; data: RepoIntelPayload }
  | { kind: "deps"; data: DepsPayload }
  | { kind: "static"; data: StaticPayload }
  | { kind: "reproduce"; data: ReproducePayload }
  | { kind: "root"; data: RootCausePayload }
  | { kind: "blast"; data: BlastPayload }
  | { kind: "planner"; data: PlannerPayload }
  | { kind: "patch"; data: PatchPayload }
  | { kind: "mutation"; data: MutationPayload }
  | { kind: "merge"; data: MergePayload };
