/**
 * Typed models for the Run Report, Workspace Header, Executive Summary and
 * Repair Attempts.
 *
 * The MOCK_* defaults match the values currently rendered in the UI so the
 * visual output is identical until a backend supplies real data.
 */
export type TrustTone = "ok" | "warn" | "bad";

export interface TrustMetric {
  label: string;
  value: number;
  tone: TrustTone;
}

export interface EvidenceFlag {
  ok: boolean;
  text: string;
}

export type RunDecision = "merge" | "draft" | "failed";

export interface RunReportModel {
  runId: string;
  shortRunId: string;
  repository: string;
  branch: string;
  decision: RunDecision;
  decisionLabel: string;
  trustScore: number;
  trustThreshold: number;
  rootCause: {
    function: string;
    location: string;
    expression: string;
    summary: string;
  };
  rejection: {
    attempts: number;
    survivors: number;
    score: number;
    threshold: number;
  };
  trust: TrustMetric[];
  files: string[];
  evidence: EvidenceFlag[];
  proofBundle: string;
  /** Total number of agents executed (used in the report footer). */
  agentCount: number;
  /** Aggregate execution duration in seconds. */
  totalDurationSeconds: number;
}

export interface WorkspaceHeaderModel {
  repository: string;
  branch: string;
  shortRunId: string;
  retries: number;
  executionTime: string;
  decisionLabel: string;
}

export interface ExecutiveSummaryModel {
  repository: string;
  bug: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  rootCause: string;
  confidence: string;
  filesAffected: number;
  attempts: number;
  mutationScore: string;
  runtime: string;
  trustScore: string;
  decision: RunDecision;
  decisionReason: string;
}

export interface RetryAttempt {
  n: number;
  action: string;
  detail: string;
  result: string;
  mutation: number;
}

export interface RepairAttemptsModel {
  attempts: RetryAttempt[];
  failureMessage: string;
  nextStepLabel: string;
}

export interface RepoMetadata {
  owner: string;
  name: string;
  language: string | null;
  branch: string;
  visibility: "Public" | "Private";
  htmlUrl: string;
}


