/**
 * Single export surface for typed models and UI-only constants.
 *
 * Production swap path: all data is now fetched via `src/lib/runService.ts`.
 * UI components import types from this barrel and call services for data.
 */
export type {
  RunReportModel,
  WorkspaceHeaderModel,
  ExecutiveSummaryModel,
  RepairAttemptsModel,
  RetryAttempt,
  RepoMetadata,
  TrustTone,
  TrustMetric,
  EvidenceFlag,
  RunDecision,
} from "./runReport";

export type {
  AgentEntry,
  AgentStatus,
  EvidencePayload,
  EvidenceField,
  MetricItem,
} from "@/components/proofix/data";

export { HANDOFF_LABELS } from "./handoff";
