export type MonitorKind = "mention" | "serp" | "page" | "reviews";
export type OwnerTag = "mine" | "competitor";
export type Schedule = "hourly" | "every_6h" | "daily" | "weekly";
export type MonitorStatus = "active" | "paused" | "paused_budget" | "failing";
export type SourceId = "news" | "google" | "page" | "screenshot" | "x" | "reddit" | "linkedin" | "maps_reviews" | "appstore_reviews";
export type RunStatus = "completed" | "failed" | "blocked" | "stopped" | "blocked_price" | "blocked_budget" | "demo";
export type RunTrigger = "schedule" | "manual";
export type AlertKind = "mention" | "serp_new" | "serp_move" | "page_change" | "review" | "system";
export type Severity = "high" | "medium" | "low";
export type AlertState = "open" | "snoozed" | "done";

/** Per-kind settings of a monitor, stored as jsonb. Validated by monitorSchema.ts. */
export interface MonitorConfig {
  query?: string;
  sources?: SourceId[];
  country?: string;
  language?: string;
  depth?: 10 | 20;
  myDomain?: string;
  competitorDomains?: string[];
  url?: string;
  reader?: "jina-reader" | "serper-webpage";
  ignore?: string[];
  watchFor?: string[];
  screenshotOnChange?: boolean;
  platform?: "maps" | "appstore";
  placeId?: string;
  productId?: string;
}

export interface Monitor {
  id: string;
  ownerId: string;
  name: string;
  kind: MonitorKind;
  ownerTag: OwnerTag;
  competitorName: string | null;
  config: MonitorConfig;
  schedule: Schedule;
  runHour: number;
  status: MonitorStatus;
  maxCostPerRunMicros: number;
  monthlyCapMicros: number;
  confirmedAt: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  consecutiveFailures: number;
  lastErrorCode: string | null;
  createdAt: string;
}

export interface Run {
  id: string;
  ownerId: string;
  monitorId: string;
  source: SourceId;
  trigger: RunTrigger;
  slot: string;
  idempotencyKey: string;
  endpointId: string;
  loootRunId: string | null;
  status: RunStatus;
  quotedMicros: number;
  actualCostMicros: number;
  newItems: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface Snapshot {
  id: string;
  ownerId: string;
  monitorId: string;
  runId: string | null;
  contentHash: string;
  content: string;
  title: string | null;
  bytes: number;
  screenshotUrl: string | null;
  changed: boolean;
  takenAt: string;
}

export interface PriceChange {
  label: string;
  before: string;
  after: string;
  pct: number | null;
}

export interface SerpRow {
  position: number;
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  /** Places moved since the last run. Positive is up. null is new. */
  change?: number | null;
}

/** Source-specific extras of an alert, stored as jsonb. */
export interface AlertPayload {
  added?: number;
  removed?: number;
  priceChanges?: PriceChange[];
  beforeSnapshotId?: string;
  afterSnapshotId?: string;
  watchHits?: string[];
  position?: number;
  previousPosition?: number | null;
  query?: string;
  top?: SerpRow[];
  rating?: number;
  platform?: string;
  engagement?: number;
  engagementLabel?: string;
  outlet?: string;
  matched?: string[];
}

export interface Alert {
  id: string;
  ownerId: string;
  monitorId: string;
  runId: string | null;
  source: SourceId | "system";
  kind: AlertKind;
  fingerprint: string;
  severity: Severity;
  severityReason: string;
  title: string;
  url: string | null;
  domain: string | null;
  author: string | null;
  snippet: string | null;
  publishedAt: string | null;
  payload: AlertPayload;
  state: AlertState;
  snoozedUntil: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Settings {
  workspaceCapMicros: number;
  defaultCapMicros: number;
  escalationWords: string[];
  priorityDomains: string[];
  competitorDomains: string[];
  ignorePatterns: string[];
  snapshotRetentionDays: number;
  rawRetentionDays: number;
  timezone: string;
  digestPeriod: "daily" | "weekly";
  digestSeverities: Severity[];
  digestHour: number;
}

/** One thing a source returned, before it becomes an alert. */
export interface Item {
  fingerprint: string;
  title: string;
  url: string | null;
  domain: string | null;
  author: string | null;
  snippet: string | null;
  publishedAt: string | null;
  extra: { position?: number; rating?: number; engagement?: number; engagementLabel?: string; outlet?: string };
}

export const DEFAULT_SETTINGS: Settings = {
  workspaceCapMicros: 3_000_000,
  defaultCapMicros: 250_000,
  escalationWords: ["outage", "breach", "lawsuit", "scam", "refund", "down", "leak"],
  priorityDomains: [],
  competitorDomains: [],
  ignorePatterns: ["cookie", "last updated", "^\\d{4}-\\d{2}-\\d{2}$"],
  snapshotRetentionDays: 90,
  rawRetentionDays: 30,
  timezone: "UTC",
  digestPeriod: "weekly",
  digestSeverities: ["high", "medium", "low"],
  digestHour: 8,
};
