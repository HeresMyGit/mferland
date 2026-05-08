export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GA_SCRIPT_ID = "mferland-ga4";
const GA_MEASUREMENT_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID ?? "").trim();
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

export function trackEvent(eventType: string, properties: AnalyticsProperties = {}) {
  if (!initializeAnalytics()) return;
  const normalizedEventType = normalizeEventType(eventType);
  if (!normalizedEventType) return;
  window.gtag?.("event", normalizedEventType, sanitizeAnalyticsProperties(properties));
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
