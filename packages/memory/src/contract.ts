// Shared validation contract for T030/T031 memory manifests.
// Single source of truth for regexes and helpers so working.ts and
// digest.ts cannot drift apart.
export const HASH_RE = /^sha256:[0-9a-f]{64}$/;
export const UTC_STRUCTURE_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?Z$/;
export const SECRET_FIELD_RE = /(TOKEN|SECRET|PASSWORD|PRIVATE_KEY|CREDENTIAL|API[_-]?KEY)/i;
export const SECRET_VALUE_RE = /(ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghu_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|ghr_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;

export function hasSecretLike(v) {
  if (Array.isArray(v)) return v.some(hasSecretLike);
  if (v && typeof v === "object") return Object.entries(v).some(([k, val]) => SECRET_FIELD_RE.test(k) || hasSecretLike(val));
  return typeof v === "string" && SECRET_VALUE_RE.test(v);
}

export function isValidRfc3339Utc(s) {
  if (typeof s !== "string") return false;
  const m = UTC_STRUCTURE_RE.exec(s);
  if (!m) return false;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const hour = Number(m[4]), minute = Number(m[5]), second = Number(m[6]);
  if (month < 1 || month > 12) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

export function stableId(parts) {
  const s = JSON.stringify(parts);
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul((h2 ^ c) + ((h2 << 6) + (h2 >>> 2)), 2654435761) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export function invalid(codes) { return { ok: false, issues: [...new Set(codes)].map((code) => ({ path: "", code })) }; }
export function issue(path, code) { return { path, code }; }
export function asRecord(v): any { return v && typeof v === "object" && !Array.isArray(v) ? v : null; }
export function stringOr(v, d) { return typeof v === "string" ? v : d; }
export function nullableString(v) { return typeof v === "string" ? v : null; }
export function nullableNumber(v) { return typeof v === "number" ? v : null; }
export function numberOr(v, d) { return typeof v === "number" && Number.isFinite(v) ? v : d; }
export function nonEmpty(v) { return typeof v === "string" && v.trim().length > 0; }
export function positiveNumber(v) { return typeof v === "number" && Number.isFinite(v) && v > 0; }
export function isNonNegativeInt(v) { return Number.isInteger(v) && v >= 0; }
export function isPositiveInt(v) { return Number.isInteger(v) && v > 0; }
export function starts(v, p) { return typeof v === "string" && v.startsWith(p); }
export function normalizeId(v) { return stringOr(v, "").trim().toLowerCase(); }
export function uniqueSorted(a) { return [...new Set(a.map((x) => x.trim()).filter(Boolean))].sort(); }
export function uniqueSortedNumbers(a) { return [...new Set(a)].sort((x: any, y: any) => x - y); }
export function isSorted(a) { return a.every((x, i) => i === 0 || a[i - 1] <= x); }
export function ordinalCompareByField(field) { return (a, b) => { const x = a[field], y = b[field]; return x < y ? -1 : x > y ? 1 : 0; }; }

// A manifest id must be "<prefix><non-empty suffix>", not just the bare scheme.
export function isManifestUri(v, prefix) { return starts(v, prefix) && v.length > prefix.length; }

// Fail-closed shape checks shared by both validators.
export function checkAllowedKeys(section, allowed, path, issues) {
  const r = asRecord(section);
  if (!r) return;
  for (const k of Object.keys(r)) {
    if (!allowed.has(k)) issues.push(issue(path ? `${path}.${k}` : k, "unknown_key"));
  }
}
export function validateNullableNonEmptyString(v, path, issues) {
  if (v !== null && v !== undefined && !nonEmpty(v)) issues.push(issue(path, "must_be_null_or_non_empty_string"));
}
export function validateOptionalPrNumber(v, path, issues) {
  if (v !== null && v !== undefined && !isPositiveInt(v)) issues.push(issue(path, "must_be_positive_integer_or_null"));
}
export function validateSortedUniqueStrings(v, path, issues) {
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string") || !isSorted(v) || new Set(v).size !== v.length) issues.push(issue(path, "must_be_sorted_unique_strings"));
}
export function validateSortedUniqueNumbers(v, path, issues) {
  if (!Array.isArray(v) || !v.every((x) => Number.isInteger(x) && x > 0) || !isSorted(v) || new Set(v).size !== v.length) issues.push(issue(path, "must_be_sorted_unique_positive_integers"));
}
