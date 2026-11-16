// The lead "feature dictionary" — the single source of truth for the flat,
// tabular profile row each completed quiz produces. Every quiz answer maps to
// one column here; the row is what gets emailed to the agency, shown as a CSV
// for inspection, and (later) fed to property matching / ML. Hard facets come
// from `field`-annotated nodes; the 4 psychographic axes come from scoring.js.

import { computeAxes, nearestProfile } from "./scoring.js";

// Display labels for categorical values. Anything not listed renders as-is.
const VALUE_LABELS = {
  es: {
    rent_test: "Alquilar para descubrir", buy_live: "Comprar para vivir",
    live_invest: "Vivir e invertir", invest_later: "Invertir ahora, vivir después",
    invest_yield: "Invertir por rentabilidad",
    short: "Unos meses", year_plus: "Un año o más",
    cash: "Al contado", mortgage: "Con financiamiento",
    city: "Ciudad de Panamá", beach: "La costa",
    skyline: "Torres y skyline", walkable_historic: "Caminable e histórico",
    beachfront: "Frente al mar", coastal_retreat: "Refugio costero",
    apartment: "Apartamento", house: "Casa", either: "Sin preferencia",
    now: "De inmediato", soon: "Dentro de un año", exploring: "Solo explorando",
    true: "Sí", false: "No",
  },
  en: {
    rent_test: "Rent to discover", buy_live: "Buy to live in",
    live_invest: "Live and invest", invest_later: "Invest now, live later",
    invest_yield: "Invest for yield",
    short: "A few months", year_plus: "A year or more",
    cash: "Cash", mortgage: "Financed",
    city: "Panama City", beach: "The coast",
    skyline: "High-rise & skyline", walkable_historic: "Walkable & historic",
    beachfront: "Steps from the sand", coastal_retreat: "Quiet coastal retreat",
    apartment: "Apartment", house: "House", either: "No preference",
    now: "Right away", soon: "Within a year", exploring: "Just exploring",
    true: "Yes", false: "No",
  },
};

// Ordered, labelled facet columns for the human "criteria" summary.
// `money: true` formats as USD; `omitFalse` hides a false boolean from the
// readable summary (it stays in the CSV/row regardless).
const COLUMNS = [
  { key: "intent", label: "Intención", label_en: "Intent" },
  { key: "budget", label: "Presupuesto", label_en: "Budget", money: true },
  { key: "financing", label: "Pago", label_en: "Payment" },
  { key: "leaseTerm", label: "Duración", label_en: "Lease term" },
  { key: "region", label: "Zona", label_en: "Area" },
  { key: "cityScene", label: "Ambiente urbano", label_en: "City setting" },
  { key: "coastLife", label: "Vida costera", label_en: "Coastal life" },
  { key: "propertyType", label: "Tipo", label_en: "Property type" },
  { key: "bedroomsMin", label: "Habitaciones (mín.)", label_en: "Bedrooms (min)" },
  { key: "needsOutdoorSpace", label: "Espacio exterior", label_en: "Outdoor space", omitFalse: true },
  { key: "needsNew", label: "Construcción nueva", label_en: "New construction", omitFalse: true },
  { key: "needsNearHospital", label: "Cerca de hospital", label_en: "Near hospital", omitFalse: true },
  { key: "floorLow", label: "Piso bajo", label_en: "Low floor", omitFalse: true },
  { key: "timeline", label: "Plazo", label_en: "Timeline" },
];

// Canonical, ordered ML feature columns: internal `key` on the profile object →
// verbose `col` header in the CSV (stable even when a value is null on a path).
export const FEATURE_COLUMNS = [
  { key: "intent", col: "intent" },
  { key: "purchasePriceUsd", col: "purchase_price_usd" },
  { key: "monthlyRentUsd", col: "monthly_rent_usd" },
  { key: "financing", col: "financing_method" },
  { key: "leaseTerm", col: "lease_term" },
  { key: "region", col: "preferred_region" },
  { key: "cityScene", col: "city_setting" },
  { key: "coastLife", col: "coastal_lifestyle" },
  { key: "propertyType", col: "property_type" },
  { key: "bedroomsMin", col: "bedrooms_min" },
  { key: "needsOutdoorSpace", col: "requires_outdoor_space" },
  { key: "needsNew", col: "requires_new_construction" },
  { key: "needsNearHospital", col: "requires_near_hospital" },
  { key: "floorLow", col: "prefers_low_floor" },
  { key: "timeline", col: "move_timeline" },
  { key: "axis_buzz", col: "psych_buzz_lively_vs_calm" },
  { key: "axis_modern", col: "psych_style_modern_vs_character" },
  { key: "axis_dwelling", col: "psych_dwelling_apartment_vs_house" },
  { key: "axis_ocean", col: "psych_proximity_ocean_nearby_vs_commute" },
  { key: "archetype", col: "archetype_label" },
];

const round2 = (n) => Math.round(n * 100) / 100;

// Extract just the hard facets from quiz state (no axes). Generic over
// `field`-annotated nodes/options so flow.json stays the source of truth. Used
// both to build the final row and to evaluate adaptive `showIf` conditions
// mid-quiz.
export function collectFacets(flow, state) {
  const f = {};
  for (const node of flow.nodes || []) {
    const ans = state.answers ? state.answers[node.id] : null;
    if (!ans) continue;
    if (node.type === "single") {
      const opt = (node.options || []).find((o) => o.id === (ans.optionIds || [])[0]);
      if (node.field) f[node.field] = ans.value != null ? ans.value : opt ? opt.value : undefined;
    } else if (node.type === "range") {
      if (node.field) f[node.field] = ans.value;
    } else if (node.type === "multi") {
      const chosen = ans.optionIds || [];
      for (const o of node.options || []) {
        if (o.field) f[o.field] = chosen.includes(o.id);
      }
    }
  }
  return f;
}

// Tiny condition evaluator for adaptive `showIf` on nodes and swipe cards.
// Leaf: { field, in:[...] } | { field, eq } | { field, gte } | { field } (present).
// Combine: { all:[...] } | { any:[...] } | { not: cond }. No condition = show.
export function matchesCondition(cond, facets) {
  if (!cond) return true;
  if (cond.all) return cond.all.every((c) => matchesCondition(c, facets));
  if (cond.any) return cond.any.some((c) => matchesCondition(c, facets));
  if (cond.not) return !matchesCondition(cond.not, facets);
  if (cond.field) {
    const v = facets[cond.field];
    if (cond.in) return cond.in.includes(v);
    if (cond.eq !== undefined) return v === cond.eq;
    if (cond.gte !== undefined) return Number(v) >= cond.gte;
    return v != null && v !== false;
  }
  return true;
}

// Build the flat profile row (facets + 4 axes + nearest archetype).
export function buildProfile(flow, state) {
  const profile = collectFacets(flow, state);
  // Split the single `budget` answer by intent so price and rent never share a
  // column (they're different units). `budget` stays for the human summary.
  const isRent = profile.intent === "rent_test";
  profile.purchasePriceUsd = isRent ? null : profile.budget ?? null;
  profile.monthlyRentUsd = isRent ? profile.budget ?? null : null;
  const axes = computeAxes(flow, state);
  for (const a of flow.axes || []) profile[`axis_${a.id}`] = round2(axes[a.id]);
  const np = nearestProfile(flow, axes);
  profile.archetype = np.id;
  return { profile, axes, archetype: np.id };
}

function fmtValue(col, value, locale) {
  if (value == null || value === "") return null;
  if (col.omitFalse && value === false) return null;
  if (col.money) return `$${Number(value).toLocaleString("en-US")}`;
  const map = VALUE_LABELS[locale] || VALUE_LABELS.es;
  return map[String(value)] ?? String(value);
}

// Human-readable criteria summary. Returns { lines: [{label, value}], text }.
export function summarizeProfile(profile, locale = "es") {
  const lines = [];
  for (const col of COLUMNS) {
    const value = fmtValue(col, profile[col.key], locale);
    if (value == null) continue;
    lines.push({ label: locale === "en" ? col.label_en : col.label, value });
  }
  const text = lines.map((l) => `${l.label}: ${l.value}`).join("\n");
  return { lines, text };
}

const lc = (s) => String(s || "").toLowerCase();

// Rich psychological readout for the reveal/email: archetype, primary driver,
// and a per-axis narrative with strength %. Sentences are generated from each
// axis's own lo/hi labels so they stay in sync with flow.json.
export function describeProfile(flow, profile, axes, locale = "es") {
  const en = locale === "en";
  const prof = (flow.profiles || []).find((p) => p.id === profile.archetype) || (flow.profiles || [])[0] || {};

  const traits = (flow.axes || []).map((a) => {
    const v = axes[a.id];
    const pct = Math.round(v * 100);
    const hi = en ? a.hi_en ?? a.hi : a.hi;
    const lo = en ? a.lo_en ?? a.lo : a.lo;
    const name = en ? a.name_en ?? a.name : a.name;
    let lean, sentence;
    if (v >= 0.66) { lean = hi; sentence = en ? `Drawn strongly to ${lc(hi)}.` : `Fuerte atracción por ${lc(hi)}.`; }
    else if (v <= 0.34) { lean = lo; sentence = en ? `Drawn strongly to ${lc(lo)}.` : `Fuerte atracción por ${lc(lo)}.`; }
    else { lean = en ? "Balanced" : "Equilibrio"; sentence = en ? `Balances ${lc(lo)} and ${lc(hi)}.` : `Equilibra ${lc(lo)} y ${lc(hi)}.`; }
    return { id: a.id, name, pct, lean, sentence };
  });

  // Dominant lifestyle axis = furthest from neutral; colours the "freedom
  // expressed as…". Dwelling (apartment/house) is a form factor, not a vibe, so
  // it's excluded from the driver phrasing.
  const lifestyle = traits.filter((t) => t.id !== "dwelling");
  const pool = lifestyle.length ? lifestyle : traits;
  const dominant = pool.reduce((best, t) => (Math.abs(t.pct - 50) > Math.abs(best.pct - 50) ? t : best), pool[0] || { lean: "" });
  const driver = en
    ? `Freedom — expressed through ${lc(dominant.lean)}.`
    : `Libertad — expresada a través de ${lc(dominant.lean)}.`;

  return { archetype: prof, driver, traits };
}

// CSV with a stable header (FEATURE_ORDER) + one data row. For inspecting the
// ML features and as the seed of a training set.
export function profileToCSV(profile) {
  const esc = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const header = FEATURE_COLUMNS.map((c) => c.col).join(",");
  const row = FEATURE_COLUMNS.map((c) => esc(profile[c.key])).join(",");
  return `${header}\n${row}`;
}
