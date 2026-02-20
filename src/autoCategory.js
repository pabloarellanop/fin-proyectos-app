// ── Auto-categorization engine ──
// Learns from expense history: vendor → { scope, category, projectCategory, method }

/**
 * Build a frequency map of vendor → most-used combination of fields.
 * @param {Array} expenses - All existing expenses
 * @returns {Map<string, { scope, category, projectCategory, method, count }>}
 */
export function buildVendorRules(expenses) {
  const vendorMap = new Map();

  for (const e of expenses) {
    const vendor = (e.vendor || "").trim().toLowerCase();
    if (!vendor || vendor.length < 2) continue;

    const key = `${vendor}||${e.scope}||${e.category}||${e.projectCategory || ""}`;
    if (!vendorMap.has(vendor)) vendorMap.set(vendor, new Map());

    const combos = vendorMap.get(vendor);
    const existing = combos.get(key) || { scope: e.scope, category: e.category, projectCategory: e.projectCategory || "", method: e.method, count: 0 };
    existing.count++;
    combos.set(key, existing);
  }

  // For each vendor, pick the most frequent combo
  const rules = new Map();
  for (const [vendor, combos] of vendorMap) {
    let best = null;
    for (const combo of combos.values()) {
      if (!best || combo.count > best.count) best = combo;
    }
    if (best && best.count >= 1) {
      rules.set(vendor, {
        scope: best.scope,
        category: best.category,
        projectCategory: best.projectCategory,
        method: best.method,
        count: best.count,
      });
    }
  }

  return rules;
}

/**
 * Suggest categorization based on vendor text.
 * Uses prefix matching and exact matching.
 * @param {string} vendorInput
 * @param {Map} rules - from buildVendorRules
 * @returns {{ suggestion: object|null, confidence: number }}
 */
export function suggestCategory(vendorInput, rules) {
  const input = (vendorInput || "").trim().toLowerCase();
  if (!input || input.length < 2 || !rules || rules.size === 0) {
    return { suggestion: null, confidence: 0 };
  }

  // Exact match
  if (rules.has(input)) {
    const rule = rules.get(input);
    return { suggestion: rule, confidence: Math.min(100, 60 + rule.count * 10) };
  }

  // Prefix match (vendor starts with input or input starts with vendor)
  let bestMatch = null;
  let bestScore = 0;
  for (const [vendor, rule] of rules) {
    if (vendor.startsWith(input) || input.startsWith(vendor)) {
      const similarity = Math.min(input.length, vendor.length) / Math.max(input.length, vendor.length);
      const score = similarity * 50 + Math.min(rule.count * 5, 30);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = rule;
      }
    }
    // Partial word match
    const words = input.split(/\s+/);
    const vendorWords = vendor.split(/\s+/);
    const matchingWords = words.filter(w => vendorWords.some(vw => vw.includes(w) || w.includes(vw)));
    if (matchingWords.length > 0) {
      const score = (matchingWords.length / Math.max(words.length, vendorWords.length)) * 40 + Math.min(rule.count * 5, 20);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = rule;
      }
    }
  }

  if (bestMatch && bestScore >= 30) {
    return { suggestion: bestMatch, confidence: Math.round(bestScore) };
  }

  return { suggestion: null, confidence: 0 };
}

/**
 * Keyword-based category suggestions (built-in rules for construction industry).
 * Fallback when no vendor history exists.
 */
const KEYWORD_RULES = [
  { keywords: ["cemento", "fierro", "arena", "grava", "ladrillo", "ceramica", "porcelanato", "pvc", "cobre", "madera", "perno", "clavo", "tornillo", "pintura"], category: "Materiales", scope: "Proyecto" },
  { keywords: ["sodimac", "easy", "homecenter", "ferreteria", "construmart", "chilemat", "imperial"], category: "Materiales", scope: "Proyecto" },
  { keywords: ["maestro", "instalador", "gásfiter", "gasfiter", "electricista", "soldador", "carpintero", "pintor"], category: "Subcontratos", scope: "Proyecto" },
  { keywords: ["arquitecto", "arquitectura", "diseño", "plano", "calculista"], category: "Arquitectura", scope: "Oficina" },
  { keywords: ["flete", "transporte", "camión", "camion", "despacho", "envio", "envío"], category: "Fletes", scope: "Proyecto" },
  { keywords: ["arriendo", "alquiler", "renta", "bodega", "container"], category: "Arriendo equipos", scope: "Proyecto" },
  { keywords: ["sueldo", "remuneración", "remuneracion", "salario", "honorario"], category: "Sueldos", scope: "Oficina" },
  { keywords: ["imposición", "imposicion", "afp", "isapre", "previred", "fonasa"], category: "Imposiciones", scope: "Oficina" },
  { keywords: ["permiso", "municipal", "dom", "sii"], category: "Permisos", scope: "Proyecto" },
  { keywords: ["bencina", "gasolina", "combustible", "copec", "shell", "petrobras"], category: "Movilización y colación", scope: "Proyecto" },
  { keywords: ["colación", "colacion", "almuerzo", "comida", "casino"], category: "Movilización y colación", scope: "Proyecto" },
  { keywords: ["herramienta", "taladro", "sierra", "amoladora", "lijadora", "makita", "dewalt", "bosch"], category: "Herramientas", scope: "Proyecto" },
  { keywords: ["meta", "facebook", "instagram", "google ads", "publicidad"], category: "Meta Ads", scope: "Oficina" },
  { keywords: ["contabilidad", "contador", "auditor"], category: "Contabilidad", scope: "Oficina" },
  { keywords: ["banco", "comisión bancaria", "mantencion cuenta", "transferencia"], category: "Bancos", scope: "Oficina" },
];

/**
 * Suggest based on keywords in vendor name or note.
 * @param {string} text - vendor or description
 * @returns {{ category: string, scope: string } | null}
 */
export function suggestByKeywords(text) {
  const lower = (text || "").toLowerCase();
  if (lower.length < 3) return null;

  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) {
        return { category: rule.category, scope: rule.scope };
      }
    }
  }
  return null;
}
