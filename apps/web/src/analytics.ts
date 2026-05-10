export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;
type TrackEventOptions = {
  google?: boolean;
  local?: boolean;
  identityType?: "guest" | "wallet" | "";
  walletAddress?: string;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GA_SCRIPT_ID = "mferland-ga4";
const GA_MEASUREMENT_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID ?? "").trim();
const LOCAL_SESSION_KEY = "mferland.analyticsSession.v1";
const SENSITIVE_PROPERTY_KEY_PATTERN = /(wallet|secret|private|mnemonic|password|txhash|transactionhash|rawtx|auth|bearer|cookie|sessiontoken|apikey|api_key)/i;

let initialized = false;

export function initializeAnalytics() {
  if (!GA_MEASUREMENT_ID || typeof window === "undefined" || typeof document === "undefined") return false;
  if (initialized) return true;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = window.gtag ?? function gtag() {
    // gtag.js expects the browser Arguments object here; a rest array initializes but does not emit collect beacons.
    window.dataLayer?.push(arguments);
  };

  if (!document.getElementById(GA_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = GA_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
    document.head.append(script);
  }

  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, {
    send_page_view: true,
  });
  initialized = true;
  return true;
}

export function trackEvent(eventType: string, properties: AnalyticsProperties = {}, options: TrackEventOptions = {}) {
  const normalizedEventType = normalizeEventType(eventType);
  if (!normalizedEventType) return;
  const sanitizedProperties = sanitizeAnalyticsProperties(properties);
  if (options.google !== false && initializeAnalytics()) window.gtag?.("event", normalizedEventType, sanitizedProperties);
  if (options.local) {
    sendLocalAnalyticsEvent(normalizedEventType, sanitizedProperties, options);
  }
}

function sendLocalAnalyticsEvent(eventType: string, properties: Record<string, string | number | boolean | null>, options: TrackEventOptions) {
  if (typeof window === "undefined") return;
  const endpoint = new URL("/analytics/event", getServerHttpBaseUrl());
  const body = JSON.stringify({
    eventType,
    sessionId: getLocalAnalyticsSessionId(),
    identityType: options.identityType ?? "",
    walletAddress: options.walletAddress ?? "",
    properties: {
      path: window.location.pathname,
      referrerHost: getReferrerHost(),
      ...properties,
    },
  });
  void fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: body.length <= 8192,
  }).catch(() => undefined);
}

function getLocalAnalyticsSessionId() {
  try {
    const existing = window.sessionStorage.getItem(LOCAL_SESSION_KEY);
    if (existing) return existing;
    const next = makeLocalAnalyticsSessionId();
    window.sessionStorage.setItem(LOCAL_SESSION_KEY, next);
    return next;
  } catch {
    return makeLocalAnalyticsSessionId();
  }
}

function makeLocalAnalyticsSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getServerHttpBaseUrl() {
  const configured = import.meta.env.VITE_SERVER_URL ? String(import.meta.env.VITE_SERVER_URL) : "";
  if (configured) return configured.replace(/^ws/i, "http");

  const protocol = window.location.protocol === "https:" ? "https" : "http";
  if (isLocalDevWebHost(window.location.hostname, window.location.port)) {
    return `${protocol}://${window.location.hostname}:2567`;
  }
  return `${protocol}://${window.location.host}`;
}

function isLocalDevWebHost(hostname: string, port: string) {
  return (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") && port !== "2567";
}

function getReferrerHost() {
  if (!document.referrer) return "";
  try {
    return new URL(document.referrer).host;
  } catch {
    return "";
  }
}

function normalizeEventType(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9_.:-]+/g, "_")
    .replaceAll(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function sanitizeAnalyticsProperties(properties: AnalyticsProperties) {
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(properties).slice(0, 24)) {
    const normalizedKey = normalizePropertyKey(key);
    if (!normalizedKey || SENSITIVE_PROPERTY_KEY_PATTERN.test(normalizedKey) || value === undefined) continue;
    if (typeof value === "string") result[normalizedKey] = value.slice(0, 160);
    else if (typeof value === "number" && Number.isFinite(value)) result[normalizedKey] = value;
    else if (typeof value === "boolean" || value === null) result[normalizedKey] = value;
  }
  return result;
}

function normalizePropertyKey(value: string) {
  return value
    .replaceAll(/[^a-zA-Z0-9_]+/g, "_")
    .replaceAll(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}
