export const TOOL_NAMES = [
  "lookup_service_health",
  "search_logs",
  "read_runbook",
  "web_search",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

export interface Incident {
  id: string;
  title: string;
  severity: "sev1" | "sev2" | "sev3";
  openedAt: string;
  alert: string;
  blurb: string;
  services: string[];
  requiredTools: ToolName[];
  causeKeywords: string[];
  evidenceIds: string[];
}

export const KNOWN_SERVICES = [
  "checkout-api",
  "payments-db",
  "identity-gateway",
  "order-events",
  "edge-proxy",
] as const;

export const INCIDENTS: Incident[] = [
  {
    id: "checkout-latency",
    title: "Checkout p99 after payments-7f3c",
    severity: "sev2",
    openedAt: "2026-10-22T14:06:00Z",
    alert:
      "Checkout p99 latency is 4.2s (SLO 800ms) since deploy payments-7f3c at 14:06 UTC. checkout-api error rate is 6.1%. payments-db is the dependency.",
    blurb: "Latency jumped in the same minute as a payments deploy.",
    services: ["checkout-api", "payments-db"],
    requiredTools: ["lookup_service_health", "search_logs", "read_runbook"],
    causeKeywords: ["pool", "connection"],
    evidenceIds: ["ev-checkout-pool", "ev-payments-db-saturation"],
  },
  {
    id: "auth-5xx",
    title: "Login 500s from identity-gateway",
    severity: "sev1",
    openedAt: "2026-10-22T00:10:00Z",
    alert:
      "identity-gateway is returning HTTP 500 on /oauth/token. Login failures started at 00:10 UTC. edge-proxy is healthy.",
    blurb: "Token requests fail. The edge proxy is still up.",
    services: ["identity-gateway", "edge-proxy"],
    requiredTools: ["lookup_service_health", "search_logs", "read_runbook", "web_search"],
    causeKeywords: ["certificate", "cert", "expired"],
    evidenceIds: ["ev-idp-cert", "ev-vendor-status"],
  },
  {
    id: "queue-lag",
    title: "order-events consumer lag",
    severity: "sev2",
    openedAt: "2026-10-22T09:40:00Z",
    alert:
      "order-events consumer lag is 84012 messages. Checkout still accepts orders. The consumer process is up.",
    blurb: "The queue is backing up and the consumer has not crashed.",
    services: ["order-events", "checkout-api"],
    requiredTools: ["lookup_service_health", "search_logs", "read_runbook"],
    causeKeywords: ["poison", "schema"],
    evidenceIds: ["ev-poison-message", "ev-schema-mismatch"],
  },
];

export function getIncident(id: string | null | undefined): Incident | null {
  if (!id) return null;
  return INCIDENTS.find((incident) => incident.id === id) ?? null;
}

export function matchIncidentId(text: string): string | null {
  const haystack = text.toLowerCase();
  const explicit = INCIDENTS.find((incident) => haystack.includes(incident.id));
  if (explicit) return explicit.id;
  if (haystack.includes("checkout") || haystack.includes("payments-db")) return "checkout-latency";
  if (haystack.includes("identity") || haystack.includes("login") || haystack.includes("oauth")) {
    return "auth-5xx";
  }
  if (haystack.includes("queue") || haystack.includes("order-events") || haystack.includes("lag")) {
    return "queue-lag";
  }
  return null;
}

export function unknownIncidentMessage(): string {
  const ids = INCIDENTS.map((incident) => incident.id).join(", ");
  return `Pick a seeded incident (${ids}). This desk investigates the Northwind seed, so a free-form alert still has to map to one of those ids.`;
}

interface HealthRow {
  service: string;
  status: string;
  p99_ms: number;
  error_rate: number;
  notes: string;
  evidence_id?: string;
}

interface LogRow {
  service: string;
  ts: string;
  level: string;
  message: string;
  evidence_id: string;
  terms: string[];
}

interface RunbookSection {
  id: string;
  title: string;
  keywords: string[];
  steps: string[];
}

const HEALTH: Record<string, HealthRow[]> = {
  "checkout-latency": [
    {
      service: "checkout-api",
      status: "degraded",
      p99_ms: 4200,
      error_rate: 0.061,
      notes: "Deploy payments-7f3c at 14:06 UTC. Timeouts waiting on payments-db.",
      evidence_id: "ev-checkout-latency",
    },
    {
      service: "payments-db",
      status: "saturated",
      p99_ms: 1800,
      error_rate: 0.01,
      notes: "98 of 100 connections in use. max_connections is 100.",
      evidence_id: "ev-payments-db-saturation",
    },
  ],
  "auth-5xx": [
    {
      service: "identity-gateway",
      status: "failing",
      p99_ms: 900,
      error_rate: 0.18,
      notes: "HTTP 500 on /oauth/token since 00:10 UTC. Upstream TLS errors.",
      evidence_id: "ev-identity-5xx",
    },
    {
      service: "edge-proxy",
      status: "ok",
      p99_ms: 40,
      error_rate: 0.001,
      notes: "Proxy itself is healthy. Failures are generated upstream.",
    },
  ],
  "queue-lag": [
    {
      service: "order-events",
      status: "lagging",
      p99_ms: 220,
      error_rate: 0.004,
      notes: "Consumer process is up. Lag is 84012. A single partition is stuck.",
      evidence_id: "ev-consumer-lag",
    },
    {
      service: "checkout-api",
      status: "ok",
      p99_ms: 310,
      error_rate: 0.002,
      notes: "Checkout is still accepting orders. The backlog is async.",
    },
  ],
};

const HEALTHY: HealthRow = {
  service: "",
  status: "ok",
  p99_ms: 160,
  error_rate: 0.001,
  notes: "No active incident signal on this service in the Northwind seed.",
};

const LOGS: Record<string, LogRow[]> = {
  "checkout-latency": [
    {
      service: "checkout-api",
      ts: "2026-10-22T14:07:11Z",
      level: "error",
      message:
        "timeout acquiring payments-db connection after 2000ms (pool 100/100) deploy=payments-7f3c",
      evidence_id: "ev-checkout-pool",
      terms: ["pool", "timeout", "connection", "payments-7f3c"],
    },
    {
      service: "checkout-api",
      ts: "2026-10-22T14:06:04Z",
      level: "info",
      message: "deploy payments-7f3c applied pool_size=100 (previous 20)",
      evidence_id: "ev-pool-change",
      terms: ["pool", "deploy", "payments-7f3c"],
    },
    {
      service: "payments-db",
      ts: "2026-10-22T14:07:12Z",
      level: "error",
      message: "max_connections=100 reached; 98 backends active; waiting=41",
      evidence_id: "ev-payments-db-saturation",
      terms: ["connection", "max_connections", "pool", "waiting"],
    },
  ],
  "auth-5xx": [
    {
      service: "identity-gateway",
      ts: "2026-10-22T00:10:02Z",
      level: "error",
      message:
        "upstream idp TLS handshake failed: certificate expired 2026-10-21T00:00:00Z subject=harbor-id",
      evidence_id: "ev-idp-cert",
      terms: ["certificate", "cert", "expired", "tls", "handshake"],
    },
    {
      service: "identity-gateway",
      ts: "2026-10-22T00:10:03Z",
      level: "error",
      message: "HTTP 500 returned for /oauth/token because the upstream is unreachable",
      evidence_id: "ev-oauth-500",
      terms: ["500", "oauth", "upstream"],
    },
  ],
  "queue-lag": [
    {
      service: "order-events",
      ts: "2026-10-22T09:41:18Z",
      level: "error",
      message:
        "poison message rejected: unknown field promo_code_v2; sent to dlq; partition 3 offset 88421",
      evidence_id: "ev-poison-message",
      terms: ["poison", "schema", "dlq", "promo_code_v2"],
    },
    {
      service: "order-events",
      ts: "2026-10-22T09:41:19Z",
      level: "warn",
      message: "consumer lag 84012; processing stopped on schema mismatch at partition 3",
      evidence_id: "ev-schema-mismatch",
      terms: ["schema", "lag", "partition"],
    },
  ],
};

const RUNBOOKS: RunbookSection[] = [
  {
    id: "rb-checkout-latency",
    title: "Checkout latency",
    keywords: ["checkout", "latency", "pool", "payments"],
    steps: [
      "Compare checkout-api pool_size with payments-db max_connections before adding API replicas.",
      "If the database is saturated, roll the pool back to the previous size and watch p99.",
      "Scale the database only after the pool change is confirmed in the deploy log.",
    ],
  },
  {
    id: "rb-auth-5xx",
    title: "Identity gateway 5xx",
    keywords: ["auth", "5xx", "login", "identity", "certificate", "oauth"],
    steps: [
      "Read the upstream TLS error before restarting the gateway.",
      "If the certificate is expired, check the vendor status page, then trust the new chain.",
      "Do not fail open on /oauth/token.",
    ],
  },
  {
    id: "rb-queue-lag",
    title: "Consumer lag",
    keywords: ["queue", "lag", "consumer", "dlq", "order"],
    steps: [
      "If the consumer process is up and lag is growing, inspect the DLQ before scaling consumers.",
      "A poison message after a schema change pins the partition.",
      "Fix or quarantine that message, then confirm lag starts falling.",
    ],
  },
];

const SEEDED_WEB: Record<string, Record<string, unknown>> = {
  "auth-5xx": {
    provider: "seeded-replay",
    source: "northwind-seed",
    live_call: false,
    note: "Recorded example of a public status page. Tavily was not called.",
    results: [
      {
        title: "Harbor ID status — certificate rotation",
        url: "https://status.example.invalid/harbor-id/cert-rotation",
        content:
          "Harbor ID rotated the signing certificate at 2026-10-21 00:00 UTC. The previous certificate expired. Customers should trust the new chain and retry token requests.",
        evidence_id: "ev-vendor-status",
      },
    ],
  },
};

const SEED_NOTE = "Seeded Northwind telemetry. This is not a live production account.";

export function lookupServiceHealth(serviceRaw: unknown, incidentId: string): Record<string, unknown> {
  const service = normalizeService(serviceRaw);
  if (!service) return { source: "northwind-seed", error: "service is required", known_services: KNOWN_SERVICES };
  if (!isKnownService(service)) {
    return {
      source: "northwind-seed",
      error: "Unknown service in the Northwind seed.",
      service,
      known_services: KNOWN_SERVICES,
    };
  }
  const row = (HEALTH[incidentId] ?? []).find((entry) => entry.service === service) ?? {
    ...HEALTHY,
    service,
  };
  return { source: "northwind-seed", note: SEED_NOTE, incident_id: incidentId, ...row };
}

export function searchLogs(
  serviceRaw: unknown,
  queryRaw: unknown,
  incidentId: string,
): Record<string, unknown> {
  const service = normalizeService(serviceRaw);
  const query = typeof queryRaw === "string" ? queryRaw.trim().toLowerCase() : "";
  if (!service || !query) {
    return { source: "northwind-seed", error: "service and query are required" };
  }
  if (!isKnownService(service)) {
    return {
      source: "northwind-seed",
      error: "Unknown service in the Northwind seed.",
      service,
      known_services: KNOWN_SERVICES,
    };
  }
  const rows = (LOGS[incidentId] ?? []).filter((row) => row.service === service);
  const matches = rows.filter(
    (row) => row.message.toLowerCase().includes(query) || row.terms.some((term) => term.includes(query) || query.includes(term)),
  );
  return {
    source: "northwind-seed",
    note: SEED_NOTE,
    incident_id: incidentId,
    service,
    query,
    matches: matches.map((row) => ({
      evidence_id: row.evidence_id,
      ts: row.ts,
      level: row.level,
      message: row.message,
    })),
    hint: matches.length === 0 ? `No lines matched. Indexed terms: ${indexedTerms(rows)}` : undefined,
  };
}

export function readRunbook(symptomRaw: unknown): Record<string, unknown> {
  const symptom = typeof symptomRaw === "string" ? symptomRaw.trim().toLowerCase() : "";
  if (!symptom) return { source: "northwind-seed", error: "symptom is required" };
  let best: RunbookSection | null = null;
  let bestScore = 0;
  for (const section of RUNBOOKS) {
    const score = section.keywords.filter((keyword) => symptom.includes(keyword)).length;
    if (score > bestScore) {
      best = section;
      bestScore = score;
    }
  }
  if (!best) {
    return {
      source: "northwind-seed",
      error: "No runbook section matched.",
      available: RUNBOOKS.map((section) => section.title),
    };
  }
  return {
    source: "northwind-seed",
    note: SEED_NOTE,
    id: best.id,
    title: best.title,
    steps: best.steps,
  };
}

export function seededWebSearch(incidentId: string, query: string): Record<string, unknown> {
  const seeded = SEEDED_WEB[incidentId];
  if (!seeded) {
    return {
      provider: "seeded-replay",
      source: "northwind-seed",
      live_call: false,
      query,
      note: "This recorded incident has no public status page in the seed. Tavily was not called.",
      results: [],
    };
  }
  return { ...seeded, query };
}

function normalizeService(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isKnownService(service: string): boolean {
  return (KNOWN_SERVICES as readonly string[]).includes(service);
}

function indexedTerms(rows: LogRow[]): string {
  const terms = new Set<string>();
  for (const row of rows) {
    for (const term of row.terms) terms.add(term);
  }
  return [...terms].join(", ") || "(none)";
}
