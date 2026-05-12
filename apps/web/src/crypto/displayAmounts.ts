const COMPACT_SUFFIXES = [
  { value: 1_000_000_000, suffix: "b" },
  { value: 1_000_000, suffix: "m" },
  { value: 1_000, suffix: "k" },
] as const;

export function formatCompactTokenAmount(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized === "--") return normalized || "--";

  const numeric = Number(normalized.replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return normalized;
  if (numeric === 0) return "0";

  const sign = numeric < 0 ? "-" : "";
  const absolute = Math.abs(numeric);
  for (const { value: divisor, suffix } of COMPACT_SUFFIXES) {
    if (absolute >= divisor) {
      const scaled = absolute / divisor;
      return `~${sign}${formatCompactNumber(scaled)}${suffix}`;
    }
  }

  if (absolute >= 1) return `~${sign}${Math.round(absolute).toLocaleString()}`;
  return `~${sign}${formatSmallDecimal(absolute)}`;
}

function formatCompactNumber(value: number) {
  if (value >= 10) return Math.round(value).toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatSmallDecimal(value: number) {
  if (value < 0.01) return "<0.01";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatReadableDecimal(value: string) {
  const normalized = value.trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return normalized;
  if (parsed === 0) return "0";

  const absolute = Math.abs(parsed);
  if (absolute < 1) return formatTinyDecimal(parsed);
  if (absolute < 1_000) return parsed.toLocaleString(undefined, { maximumSignificantDigits: 6 });
  return parsed.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatTinyDecimal(value: number) {
  const absolute = Math.abs(value);
  const decimals = Math.min(12, Math.max(2, Math.ceil(-Math.log10(absolute)) + 3));
  const fixed = absolute
    .toFixed(decimals)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
  return value < 0 ? `-${fixed}` : fixed;
}
