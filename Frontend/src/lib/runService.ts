/**
 * Run service — adapter layer between UI and the backend API.
 *
 * Transforms raw backend responses (RunSummary, AgentStatusEvent[]) into
 * the frontend's UI-specific models. No backend-specific view endpoints needed.
 */
import { DATA_SOURCE, ENDPOINTS, apiFetch } from "./api";
import type {
  RunReportModel,
  WorkspaceHeaderModel,
  ExecutiveSummaryModel,
  RepairAttemptsModel,
  RepoMetadata,
  TrustTone,
} from "@/mocks";
import type { SidebarRepo } from "@/components/proofix/Sidebar";
import type { AgentEntry, AgentStatus } from "@/components/proofix/data";
import { FALLBACK_AGENTS } from "@/components/proofix/data";

// ── Backend response types ─────────────────────────────────────────

export interface BackendRunSummary {
  run_id: string;
  status: string;
  current_agent: string;
  force_draft_pr: boolean;
  retry_count: number;
  pr_decision: {
    pr_type: string;
    axis_scores: { correctness: number; security: number; fidelity: number; scope_risk: number };
    pr_url: string | null;
    description_why: string;
    description_what: string;
    review_note: string;
  } | null;
  errors: Array<{ message?: string }>;
}

export interface BackendEvent {
  run_id: string;
  agent_id: string;
  status: string;
  timestamp: string;
  message: string;
  payload: Record<string, unknown> | null;
  sequence: number;
}

// ── Agent mapping ──────────────────────────────────────────────────

const AGENT_META: Record<string, { index: number; id: string; agent: string; purpose: string }> = {
  A1:    { index: 0,  id: "repo-intel",  agent: "Repository Intelligence",  purpose: "Map repository structure and classify file roles" },
  A2:    { index: 1,  id: "deps",        agent: "Dependency Analyzer",      purpose: "Scan dependencies for known vulnerabilities" },
  A3:    { index: 2,  id: "static",      agent: "Static Analysis",          purpose: "Run static analysis tools and prioritize findings" },
  "A3.5":{ index: 3,  id: "reproduce",   agent: "Failure Reproduction",     purpose: "Reproduce the reported failure with pytest" },
  A4:    { index: 4,  id: "root",        agent: "Root Cause Analysis",      purpose: "Identify the root cause of the failure" },
  A5:    { index: 5,  id: "blast",       agent: "Blast Radius",             purpose: "Determine blast radius of the issue" },
  A6:    { index: 6,  id: "planner",     agent: "Repair Planner",           purpose: "Plan fix ordering with dependency DAG" },
  A7:    { index: 7,  id: "patch",       agent: "Patch Generator",          purpose: "Generate code patches for the issue" },
  A8:    { index: 8,  id: "mutation",    agent: "Mutation Validation",      purpose: "Validate patches with mutation testing" },
  A9:    { index: 9,  id: "security",    agent: "Security Rescan",          purpose: "Re-scan for security regressions" },
  A10:   { index: 10, id: "merge",       agent: "Mergeability Router",      purpose: "Score trust axes and route PR decision" },
};

// ── Helpers ────────────────────────────────────────────────────────

function scoreTone(value: number): TrustTone {
  if (value >= 85) return "ok";
  if (value >= 65) return "warn";
  return "bad";
}

function mapDecision(prType: string | undefined): "merge" | "draft" | "failed" {
  if (prType === "auto_mergeable") return "merge";
  if (prType === "draft") return "draft";
  return "failed";
}

function decisionLabel(d: "merge" | "draft" | "failed"): string {
  if (d === "merge") return "Auto Merge";
  if (d === "draft") return "Draft PR";
  return "Failed";
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

// ── Public API ─────────────────────────────────────────────────────

/** Parse a GitHub URL into owner/name. Pure client-side gating only. */
export function parseGithubUrl(
  raw: string,
): { owner: string; name: string } | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    if (!u.hostname.includes("github.com")) return null;
    const [owner, repoRaw] = u.pathname.split("/").filter(Boolean);
    if (!owner || !repoRaw) return null;
    return { owner, name: repoRaw.replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

/**
 * Start a new analysis run. Returns the backend-assigned run ID.
 */
export async function startRun(repoUrl: string): Promise<string> {
  const { run_id } = await apiFetch<{ run_id: string }>(ENDPOINTS.runs(), {
    method: "POST",
    json: { repo_url: repoUrl },
  });
  return run_id;
}

/**
 * Lightweight status poll — returns the raw backend summary.
 * Used by the polling interval to detect completion without heavy transforms.
 */
export async function fetchRunStatus(runId: string): Promise<BackendRunSummary> {
  return apiFetch<BackendRunSummary>(ENDPOINTS.run(runId));
}

/**
 * Fetch all events for a run.
 */
export async function fetchRunEvents(runId: string): Promise<BackendEvent[]> {
  if (DATA_SOURCE !== "api") return [];
  return apiFetch<BackendEvent[]>(ENDPOINTS.runEvents(runId));
}

/**
 * Fetch SIG data for a run.
 */
export async function fetchSigData(runId: string): Promise<Record<string, unknown> | null> {
  if (DATA_SOURCE !== "api") return null;
  try {
    return await apiFetch<Record<string, unknown>>(ENDPOINTS.runSig(runId));
  } catch {
    return null;
  }
}

// ── Agent-specific data fetchers ───────────────────────────────────

async function safeFetch<T>(endpoint: string): Promise<T | null> {
  try {
    return await apiFetch<T>(endpoint);
  } catch {
    return null;
  }
}

export async function fetchCveReport(runId: string): Promise<Record<string, unknown> | null> {
  if (DATA_SOURCE !== "api") return null;
  return safeFetch(ENDPOINTS.runCve(runId));
}

export async function fetchStaticReport(runId: string): Promise<Record<string, unknown> | null> {
  if (DATA_SOURCE !== "api") return null;
  return safeFetch(ENDPOINTS.runStatic(runId));
}

export async function fetchBlastGraph(runId: string): Promise<Record<string, unknown> | null> {
  if (DATA_SOURCE !== "api") return null;
  return safeFetch(ENDPOINTS.runBlast(runId));
}

export async function fetchFixPlan(runId: string): Promise<Record<string, unknown> | null> {
  if (DATA_SOURCE !== "api") return null;
  return safeFetch(ENDPOINTS.runFixPlan(runId));
}

export async function fetchPatches(runId: string): Promise<Record<string, unknown> | null> {
  if (DATA_SOURCE !== "api") return null;
  return safeFetch(ENDPOINTS.runPatches(runId));
}

export async function fetchHumanReview(runId: string): Promise<Record<string, unknown> | null> {
  if (DATA_SOURCE !== "api") return null;
  return safeFetch(ENDPOINTS.runHumanReview(runId));
}

/**
 * Enrichment data fetched from agent-specific endpoints.
 * All fields are optional — null means not yet fetched or unavailable.
 */
export interface AgentEnrichment {
  cve: Record<string, unknown> | null;
  static: Record<string, unknown> | null;
  blast: Record<string, unknown> | null;
  fixPlan: Record<string, unknown> | null;
  patches: Record<string, unknown> | null;
  humanReview: Record<string, unknown> | null;
}

/**
 * Fetch all agent enrichment data in parallel.
 */
export async function fetchAgentEnrichment(runId: string): Promise<AgentEnrichment> {
  if (DATA_SOURCE !== "api") {
    return { cve: null, static: null, blast: null, fixPlan: null, patches: null, humanReview: null };
  }
  const [cve, staticR, blast, fixPlan, patches, humanReview] = await Promise.all([
    fetchCveReport(runId),
    fetchStaticReport(runId),
    fetchBlastGraph(runId),
    fetchFixPlan(runId),
    fetchPatches(runId),
    fetchHumanReview(runId),
  ]);
  return { cve, static: staticR, blast, fixPlan, patches, humanReview };
}

// ── Helpers to extract typed values from backend dicts ──────────────

function asNum(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = Number(v); return isNaN(n) ? null : n; }
  return null;
}

function asStr(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

function asStrArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

type D = Record<string, unknown>;

function isEmpty(d: D | null | undefined): boolean {
  return !d || Object.keys(d).length === 0;
}

// ── Enrichment: overlay real backend data onto FALLBACK_AGENTS ──────

function enrichCve(fallback: AgentEntry, data: D): Partial<AgentEntry> {
  const records = asArr(data.records);
  const critical = asNum(data.critical_count) ?? records.filter((r) => (r as D)?.severity === "CRITICAL").length;
  const total = records.length || asNum(data.total_count) || 0;
  const unknown = asNum(data.unknown_count) ?? 0;
  const pkgs = asArr(data.packages ?? data.dependencies);
  return {
    metrics: [
      { label: "Packages", value: String(pkgs.length || fallback.metrics?.[0]?.value || "—") },
      { label: "CVEs Found", value: String(total) },
      { label: "Critical", value: String(critical) },
      { label: "Unknown", value: String(unknown) },
    ],
    evidence: {
      ...fallback.evidence,
      title: "Reachability Report",
      subtitle: `${total} vulnerabilities found, ${critical} critical.`,
      fields: [
        { label: "Total CVEs", value: String(total), mono: true },
        { label: "Critical", value: String(critical), mono: true },
        { label: "Unknown", value: String(unknown), mono: true },
        ...(records.length > 0 ? [{ label: "Records", value: `${records.length} entries` }] : []),
      ],
    },
    pills: records.slice(0, 5).map((r) => asStr((r as D)?.id ?? (r as D)?.cve_id) || "CVE").filter(Boolean) as string[],
  };
}

function enrichStatic(fallback: AgentEntry, data: D): Partial<AgentEntry> {
  const findings = asArr(data.findings);
  const prioritized = asNum(data.prioritized_count) ?? findings.length;
  const scanTargets = asStrArr(data.scan_targets);
  const high = findings.filter((f) => (f as D)?.sev === "HIGH" || (f as D)?.severity === "HIGH").length;
  const medium = findings.filter((f) => (f as D)?.sev === "MEDIUM" || (f as D)?.severity === "MEDIUM").length;
  const low = findings.filter((f) => (f as D)?.sev === "LOW" || (f as D)?.severity === "LOW").length;
  return {
    metrics: [
      { label: "Raw issues", value: String(findings.length || fallback.metrics?.[0]?.value || "—") },
      { label: "Prioritized", value: String(prioritized) },
      { label: "High", value: String(high) },
      { label: "Medium", value: String(medium) },
    ],
    evidence: {
      ...fallback.evidence,
      title: "Prioritized Findings",
      subtitle: `${prioritized} actionable issues from consensus analysis.`,
      fields: [
        { label: "High", value: String(high) },
        { label: "Medium", value: String(medium) },
        { label: "Low", value: String(low) },
        { label: "Scan targets", value: String(scanTargets.length || "—") },
      ],
      pills: scanTargets.slice(0, 5),
    },
    pills: scanTargets.slice(0, 6),
  };
}

function enrichBlast(fallback: AgentEntry, data: D): Partial<AgentEntry> {
  const origins = asArr(data.origins);
  const autoPatchable = asArr(data.auto_patchable ?? data.auto_patchable_files);
  const scope = asNum(data.scope_count) ?? autoPatchable.length;
  const files = autoPatchable.map((f) => asStr((f as D)?.file ?? f) || "").filter(Boolean);
  return {
    metrics: [
      { label: "Scope", value: `${scope} files` },
      { label: "Origins", value: String(origins.length) },
      { label: "Auto-patchable", value: String(autoPatchable.length) },
    ],
    pills: files.slice(0, 6),
    evidence: {
      ...fallback.evidence,
      title: "Affected Files",
      subtitle: `${scope} files in blast radius from ${origins.length} origins.`,
      fields: [
        { label: "Scope", value: `${scope} modules` },
        { label: "Origins", value: String(origins.length) },
        ...(files.length > 0 ? [{ label: "Primary target", value: files[0], mono: true }] : []),
      ],
      pills: files.slice(0, 5),
    },
  };
}

function enrichFixPlan(fallback: AgentEntry, data: D): Partial<AgentEntry> {
  const order = asArr(data.order);
  const conflictBatches = asArr(data.conflict_batches);
  const edges = asArr(data.dependency_edges ?? data.edges);
  return {
    metrics: [
      { label: "Repair steps", value: String(order.length) },
      { label: "Conflicts", value: String(conflictBatches.length) },
      { label: "DAG edges", value: String(edges.length) },
    ],
    evidence: {
      ...fallback.evidence,
      title: "Repair DAG",
      subtitle: `${order.length} ordered steps, ${conflictBatches.length} conflict batches.`,
      fields: order.slice(0, 4).map((step, i) => ({
        label: `Stage ${i + 1}`,
        value: asStr((step as D)?.file ?? (step as D)?.target ?? step) || `Step ${i + 1}`,
        mono: true,
      })),
    },
  };
}

function enrichPatches(fallback: AgentEntry, data: D): Partial<AgentEntry> {
  const patches = asArr(data.patches);
  const diffText = asStr(data.diff_text) || "";
  const files = patches.map((p) => asStr((p as D)?.file) || "").filter(Boolean);
  const diffLines = diffText ? diffText.split("\n").length : 0;
  return {
    modifiedFiles: files.length > 0 ? files : undefined,
    metrics: [
      { label: "Files patched", value: String(files.length) },
      { label: "Diff lines", value: String(diffLines) },
      { label: "Patches", value: String(patches.length) },
    ],
    evidence: {
      ...fallback.evidence,
      title: "Generated Patches",
      subtitle: `${patches.length} patches across ${files.length} files.`,
      fields: [
        { label: "Files", value: String(files.length), mono: true },
        { label: "Diff size", value: `${diffLines} lines`, mono: true },
        ...(files.slice(0, 2).map((f) => ({ label: "Target", value: f, mono: true }))),
      ],
    },
    details: diffText ? { ...fallback.details, output: diffText.slice(0, 2000) } : fallback.details,
  };
}

function enrichHumanReview(blast: Partial<AgentEntry>, data: D): Partial<AgentEntry> {
  const files = asStrArr(data.files);
  if (files.length === 0) return {};
  // Merge into blast's existing pills
  const existingPills = blast.pills ?? [];
  const combined = [...new Set([...existingPills, ...files])];
  return {
    pills: combined.slice(0, 8),
  };
}

/**
 * Apply enrichment data to agent entries.
 * Takes existing AgentEntry[] (from events or fallback) and overlays
 * real data from the agent-specific endpoints onto matching slots.
 */
export function enrichAgents<T extends AgentEntry>(
  agents: T[],
  enrichment: AgentEnrichment,
): T[] {
  return agents.map((agent, i) => {
    let overlay: Partial<AgentEntry> = {};

    switch (i) {
      case 1: // A2 — Dependency Analyzer
        if (!isEmpty(enrichment.cve)) overlay = enrichCve(agent, enrichment.cve!);
        break;
      case 2: // A3 — Static Analysis
        if (!isEmpty(enrichment.static)) overlay = enrichStatic(agent, enrichment.static!);
        break;
      case 5: { // A5 — Blast Radius
        const blastOverlay = !isEmpty(enrichment.blast) ? enrichBlast(agent, enrichment.blast!) : {};
        const hrOverlay = !isEmpty(enrichment.humanReview) ? enrichHumanReview(blastOverlay, enrichment.humanReview!) : {};
        overlay = { ...blastOverlay, ...hrOverlay };
        break;
      }
      case 6: // A6 — Repair Planner
        if (!isEmpty(enrichment.fixPlan)) overlay = enrichFixPlan(agent, enrichment.fixPlan!);
        break;
      case 7: // A7 — Patch Generator
        if (!isEmpty(enrichment.patches)) overlay = enrichPatches(agent, enrichment.patches!);
        break;
      default:
        break;
    }

    if (Object.keys(overlay).length === 0) return agent;
    return { ...agent, ...overlay } as T;
  });
}

/**
 * Build AgentEntry[] from backend events.
 * Uses FALLBACK_AGENTS as a template for structure (visualizations, evidence)
 * and overlays real data from the event stream.
 */
export function buildAgentsFromEvents(
  events: BackendEvent[],
): AgentEntry[] {
  // Group events by agent_id
  const eventsByAgent: Record<string, BackendEvent[]> = {};
  for (const e of events) {
    if (!eventsByAgent[e.agent_id]) eventsByAgent[e.agent_id] = [];
    eventsByAgent[e.agent_id].push(e);
  }

  return FALLBACK_AGENTS.map((fallback, i) => {
    // Find the backend agent_id for this slot
    const backendId = Object.entries(AGENT_META).find(([, m]) => m.index === i)?.[0];
    if (!backendId) return fallback;

    const agentEvents = eventsByAgent[backendId] ?? [];
    if (agentEvents.length === 0) return fallback;

    // Build lines from event messages
    const lines = agentEvents
      .filter((e) => e.message)
      .map((e) => e.message);

    // Determine status from events
    const lastEvent = agentEvents[agentEvents.length - 1];
    let status: AgentStatus = "running";
    if (lastEvent?.status === "completed") status = "completed";
    else if (lastEvent?.status === "failed") status = "failed";
    else if (lastEvent?.status === "retry") status = "retry";

    // Calculate duration from first to last event timestamp
    let duration = fallback.duration;
    if (agentEvents.length >= 2) {
      const first = new Date(agentEvents[0].timestamp).getTime();
      const last = new Date(agentEvents[agentEvents.length - 1].timestamp).getTime();
      if (!isNaN(first) && !isNaN(last) && last > first) {
        duration = formatDuration(last - first);
      }
    }

    return {
      ...fallback,
      status,
      duration,
      lines: lines.length > 0 ? lines : fallback.lines,
    };
  });
}

export async function listRepositories(): Promise<SidebarRepo[]> {
  if (DATA_SOURCE !== "api") return [];
  return [];
}

export async function getWorkspaceHeader(
  runId: string,
  runData?: BackendRunSummary,
): Promise<WorkspaceHeaderModel> {
  if (DATA_SOURCE !== "api") {
    return {
      repository: "",
      branch: "main",
      shortRunId: runId.slice(0, 8),
      retries: 0,
      executionTime: "—",
      decisionLabel: "—",
    };
  }
  const run = runData ?? await apiFetch<BackendRunSummary>(ENDPOINTS.run(runId));
  const decision = mapDecision(run.pr_decision?.pr_type);
  return {
    repository: run.run_id.slice(0, 8),
    branch: "main",
    shortRunId: `${run.run_id.slice(0, 4)}…${run.run_id.slice(-4)}`,
    retries: run.retry_count,
    executionTime: "—",
    decisionLabel: run.status === "completed" ? decisionLabel(decision) : "In progress",
  };
}

export async function getExecutiveSummary(
  runId: string,
  runData?: BackendRunSummary,
): Promise<ExecutiveSummaryModel> {
  if (DATA_SOURCE !== "api") {
    return {
      repository: "",
      bug: "—",
      severity: "MEDIUM",
      rootCause: "—",
      confidence: "—",
      filesAffected: 0,
      attempts: 0,
      mutationScore: "—",
      runtime: "—",
      trustScore: "—",
      decision: "failed",
      decisionReason: "—",
    };
  }
  const run = runData ?? await apiFetch<BackendRunSummary>(ENDPOINTS.run(runId));
  const axes = run.pr_decision?.axis_scores;
  const avgTrust = axes
    ? ((axes.correctness + axes.security + axes.fidelity + axes.scope_risk) / 4).toFixed(2)
    : "—";
  const decision = mapDecision(run.pr_decision?.pr_type);
  return {
    repository: run.run_id.slice(0, 8),
    bug: run.errors?.[0]?.message ?? "Detected issue",
    severity: run.force_draft_pr ? "HIGH" : "MEDIUM",
    rootCause: run.pr_decision?.description_what ?? "—",
    confidence: axes ? `${Math.round(axes.correctness)}%` : "—",
    filesAffected: 0,
    attempts: run.retry_count,
    mutationScore: "—",
    runtime: "—",
    trustScore: avgTrust,
    decision,
    decisionReason:
      run.pr_decision?.description_why ??
      (run.status === "completed" ? "Analysis complete" : "In progress"),
  };
}

export async function getRunReport(runId: string): Promise<RunReportModel> {
  if (DATA_SOURCE !== "api") {
    return {
      runId,
      shortRunId: runId.slice(0, 8),
      repository: "",
      branch: "main",
      decision: "failed",
      decisionLabel: "N/A",
      trustScore: 0,
      trustThreshold: 0.9,
      rootCause: { function: "—", location: "—", expression: "—", summary: "—" },
      rejection: { attempts: 0, survivors: 0, score: 0, threshold: 0.92 },
      trust: [],
      files: [],
      evidence: [],
      proofBundle: "—",
      agentCount: 0,
      totalDurationSeconds: 0,
    };
  }
  const [run, events, sig] = await Promise.all([
    apiFetch<BackendRunSummary>(ENDPOINTS.run(runId)),
    fetchRunEvents(runId),
    fetchSigData(runId),
  ]);
  const axes = run.pr_decision?.axis_scores;
  const decision = mapDecision(run.pr_decision?.pr_type);
  const trustArr = axes
    ? [
        { label: "Correctness", value: Math.round(axes.correctness), tone: scoreTone(axes.correctness) },
        { label: "Security", value: Math.round(axes.security), tone: scoreTone(axes.security) },
        { label: "Fidelity", value: Math.round(axes.fidelity), tone: scoreTone(axes.fidelity) },
        { label: "Scope Risk", value: Math.round(axes.scope_risk), tone: scoreTone(axes.scope_risk) },
      ]
    : [];
  const avgTrust = axes
    ? (axes.correctness + axes.security + axes.fidelity + axes.scope_risk) / 400
    : 0;

  // Calculate total duration from events
  let totalDurationSeconds = 0;
  if (events.length >= 2) {
    const first = new Date(events[0].timestamp).getTime();
    const last = new Date(events[events.length - 1].timestamp).getTime();
    if (!isNaN(first) && !isNaN(last)) {
      totalDurationSeconds = (last - first) / 1000;
    }
  }

  // Extract files from SIG data
  const files: string[] = [];
  if (sig && typeof sig === "object") {
    const nodes = (sig as Record<string, unknown>).nodes;
    if (Array.isArray(nodes)) {
      for (const n of nodes) {
        if (typeof n === "object" && n && "file" in n && typeof (n as Record<string, unknown>).file === "string") {
          files.push((n as Record<string, unknown>).file as string);
        }
      }
    }
  }

  return {
    runId: run.run_id,
    shortRunId: `${run.run_id.slice(0, 4)}…${run.run_id.slice(-4)}`,
    repository: run.run_id.slice(0, 8),
    branch: "main",
    decision,
    decisionLabel: decisionLabel(decision),
    trustScore: avgTrust,
    trustThreshold: 0.9,
    rootCause: {
      function: run.pr_decision?.description_what ?? "—",
      location: "—",
      expression: "—",
      summary: run.pr_decision?.description_why ?? "—",
    },
    rejection: { attempts: run.retry_count, survivors: 0, score: 0, threshold: 0.92 },
    trust: trustArr,
    files,
    evidence: [
      { ok: run.status === "completed", text: run.status === "completed" ? "Pipeline completed" : "Pipeline in progress" },
      ...(run.force_draft_pr ? [{ ok: false, text: "Forced to draft PR" }] : []),
      ...run.errors.map((e) => ({ ok: false, text: e.message ?? "Error occurred" })),
    ],
    proofBundle: "—",
    agentCount: Object.keys(AGENT_META).length,
    totalDurationSeconds,
  };
}

export async function getRepairAttempts(
  runId: string,
): Promise<RepairAttemptsModel> {
  if (DATA_SOURCE !== "api") {
    return { attempts: [], failureMessage: "", nextStepLabel: "" };
  }
  const run = await apiFetch<BackendRunSummary>(ENDPOINTS.run(runId));
  const attempts = Array.from({ length: run.retry_count }, (_, i) => ({
    n: i + 1,
    action: "Generate Patch",
    detail: `Patch attempt ${i + 1}`,
    result: "Validation Failed",
    mutation: 0,
  }));
  return {
    attempts,
    failureMessage:
      run.retry_count > 0
        ? `Validation not satisfied after ${run.retry_count} attempts.`
        : "",
    nextStepLabel: "Proceed to Mergeability Assessment",
  };
}

/**
 * Validate a repository URL. Pure client-side — no backend endpoint needed.
 */
export async function validateRepository(
  url: string,
): Promise<RepoMetadata | null> {
  const parsed = parseGithubUrl(url);
  if (!parsed) return null;
  return {
    owner: parsed.owner,
    name: parsed.name,
    language: null,
    branch: "main",
    visibility: "Public",
    htmlUrl: `https://github.com/${parsed.owner}/${parsed.name}`,
  };
}

export async function askChat(runId: string, question: string): Promise<string> {
  return `Chat is not available yet. You can view the run details at /runs/${runId}.`;
}
