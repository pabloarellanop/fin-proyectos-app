/**
 * DTE Validator — Validación local + integración SII QueryEstDte
 *
 * Valida documentos tributarios electrónicos registrados como egresos.
 * - Validación local: RUT, folio, fecha, monto, campos requeridos, duplicados
 * - Integración SII: Construye SOAP request para QueryEstDte.jws
 *   (requiere Supabase Edge Function como proxy para evitar CORS)
 */

import { validarRut, cleanRut, calcularDV, formatRut, DOCUMENT_TYPES } from "./utils";

// ── Tipos de DTE reconocidos por el SII ──
export const SII_DTE_TYPES = {
  factura_afecta:    { code: 33,  label: "Factura Electrónica" },
  factura_exenta:    { code: 34,  label: "Factura No Afecta o Exenta" },
  boleta:            { code: 39,  label: "Boleta Electrónica" },
  boleta_honorarios: { code: 0,   label: "Boleta de Honorarios" }, // no consultable vía QueryEstDte
  nota_credito:      { code: 61,  label: "Nota de Crédito Electrónica" },
};

// ── Códigos de estado SII ──
export const SII_STATUS = {
  DOK: { label: "Documento recibido — datos coinciden",      severity: "ok" },
  DNK: { label: "Documento recibido — datos NO coinciden",   severity: "warn" },
  FAU: { label: "Documento no recibido por el SII",          severity: "bad" },
  FNA: { label: "Documento no autorizado",                   severity: "bad" },
  FAN: { label: "Documento anulado",                         severity: "bad" },
  EMP: { label: "Empresa no autorizada para DTE",            severity: "bad" },
  TMD: { label: "Nota de débito modifica texto",             severity: "warn" },
  TMC: { label: "Nota de crédito modifica texto",            severity: "warn" },
  MMD: { label: "Nota de débito modifica montos",            severity: "warn" },
  MMC: { label: "Nota de crédito modifica montos",           severity: "warn" },
  AND: { label: "Nota de débito anula documento",            severity: "bad" },
  ANC: { label: "Nota de crédito anula documento",           severity: "bad" },
};

// ── Reglas de campos requeridos por tipo de documento ──
const REQUIRED_FIELDS = {
  factura_afecta:    ["documentNumber", "documentIssuedAt", "documentProvider", "amount"],
  factura_exenta:    ["documentNumber", "documentIssuedAt", "documentProvider", "amount"],
  nota_credito:      ["documentNumber", "documentIssuedAt", "documentProvider", "amount"],
  boleta:            ["amount"],
  boleta_honorarios: ["documentProvider", "amount"],
  sin_respaldo:      [],
};

const FIELD_LABELS = {
  documentNumber:   "N° documento",
  documentIssuedAt: "Fecha emisión",
  documentProvider: "RUT proveedor",
  amount:           "Monto",
};

// ────────────────────────────────────────────
// LOCAL VALIDATION
// ────────────────────────────────────────────

/**
 * Validates a single expense's document data.
 * Returns { valid, errors[], warnings[] }
 */
export function validateExpenseDocument(expense) {
  const errors = [];
  const warnings = [];
  const docType = expense.documentType || "sin_respaldo";

  // 1. Sin respaldo → warning only
  if (docType === "sin_respaldo") {
    warnings.push("Sin documento de respaldo tributario");
    return { valid: true, errors, warnings };
  }

  // 2. Required fields
  const required = REQUIRED_FIELDS[docType] || [];
  for (const field of required) {
    const val = field === "amount" ? expense.amount : (expense[field] || "").toString().trim();
    if (!val || (field === "amount" && val <= 0)) {
      errors.push(`Falta: ${FIELD_LABELS[field] || field}`);
    }
  }

  // 3. RUT validation (if provider has a RUT-like value)
  const provider = (expense.documentProvider || expense.vendor || "").trim();
  if (provider && /\d{6,}/.test(cleanRut(provider))) {
    if (!validarRut(provider)) {
      errors.push(`RUT proveedor inválido: ${provider}`);
    }
  } else if (["factura_afecta", "factura_exenta", "nota_credito"].includes(docType) && !provider) {
    errors.push("Factura/NC requiere RUT del proveedor");
  }

  // 4. Document number format
  const docNum = (expense.documentNumber || "").trim();
  if (docNum && !/^\d{1,10}$/.test(docNum)) {
    warnings.push(`N° documento "${docNum}" debería ser numérico (1-10 dígitos)`);
  }

  // 5. Date validation
  const docDate = expense.documentIssuedAt || expense.datePaid || "";
  if (docDate) {
    const d = new Date(docDate);
    if (isNaN(d.getTime())) {
      errors.push("Fecha de emisión inválida");
    } else {
      const now = new Date();
      if (d > now) {
        warnings.push("Fecha de emisión es futura");
      }
      // More than 2 years old
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      if (d < twoYearsAgo) {
        warnings.push("Documento tiene más de 2 años de antigüedad");
      }
    }
  }

  // 6. Amount validation
  if (expense.amount <= 0) {
    errors.push("Monto debe ser mayor a 0");
  }
  if (expense.amount > 999999999) {
    warnings.push("Monto excede $999.999.999 — verificar");
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Find duplicate documents in the expense list.
 * Two expenses are duplicates if they share docType + docNumber + provider.
 */
export function findDuplicateDocuments(expenses) {
  const seen = new Map(); // key → [expense ids]
  const duplicates = [];

  for (const exp of expenses) {
    const dt = exp.documentType || "sin_respaldo";
    if (dt === "sin_respaldo") continue;
    const num = (exp.documentNumber || "").trim();
    if (!num) continue;
    const provider = cleanRut(exp.documentProvider || exp.vendor || "");
    const key = `${dt}|${num}|${provider}`;

    if (!seen.has(key)) {
      seen.set(key, []);
    }
    seen.get(key).push(exp.id);
  }

  for (const [key, ids] of seen) {
    if (ids.length > 1) {
      const [docType, docNumber] = key.split("|");
      duplicates.push({ docType, docNumber, ids, count: ids.length });
    }
  }

  return duplicates;
}

/**
 * Batch validate all expenses.
 * Returns { results: Map<id, validation>, summary }
 */
export function batchValidate(expenses) {
  const results = new Map();
  let okCount = 0, warnCount = 0, errCount = 0, noDocCount = 0;

  for (const exp of expenses) {
    const validation = validateExpenseDocument(exp);
    const docType = exp.documentType || "sin_respaldo";

    if (docType === "sin_respaldo") {
      noDocCount++;
      validation.status = "sin_doc";
    } else if (!validation.valid) {
      errCount++;
      validation.status = "error";
    } else if (validation.warnings.length > 0) {
      warnCount++;
      validation.status = "warning";
    } else {
      okCount++;
      validation.status = "ok";
    }

    results.set(exp.id, validation);
  }

  const duplicates = findDuplicateDocuments(expenses);

  // Mark duplicates with extra warning
  for (const dup of duplicates) {
    for (const id of dup.ids) {
      const v = results.get(id);
      if (v) {
        v.warnings.push(`Documento duplicado: ${dup.docType} #${dup.docNumber} (${dup.count} registros)`);
        if (v.status === "ok") { v.status = "warning"; warnCount++; okCount--; }
      }
    }
  }

  return {
    results,
    duplicates,
    summary: {
      total: expenses.length,
      ok: okCount,
      warnings: warnCount,
      errors: errCount,
      sinDocumento: noDocCount,
    },
  };
}

// ────────────────────────────────────────────
// SII QUERYESTDTE INTEGRATION
// ────────────────────────────────────────────

/**
 * Build the SOAP XML envelope for QueryEstDte.
 * @param {Object} params
 * @param {string} params.rutConsultante - RUT body (without DV)
 * @param {string} params.dvConsultante  - DV
 * @param {string} params.rutEmisor      - RUT body of document issuer
 * @param {string} params.dvEmisor       - DV of issuer
 * @param {string} params.rutReceptor    - RUT body of receiver
 * @param {string} params.dvReceptor     - DV of receiver
 * @param {string} params.tipoDte       - DTE type code (33, 34, 39, 61...)
 * @param {string} params.folioDte      - Document number
 * @param {string} params.fechaEmision  - DDMMAAAA format
 * @param {string} params.montoDte      - Total amount
 * @param {string} params.token         - Auth token from SII
 */
export function buildSOAPRequest(params) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope
  xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <SOAP-ENV:Body>
    <m:getEstDte xmlns:m="https://palena.sii.cl/DTEWS/QueryEstDte.jws">
      <RutConsultante xsi:type="xsd:string">${params.rutConsultante}</RutConsultante>
      <DvConsultante xsi:type="xsd:string">${params.dvConsultante}</DvConsultante>
      <RutCompania xsi:type="xsd:string">${params.rutEmisor}</RutCompania>
      <DvCompania xsi:type="xsd:string">${params.dvEmisor}</DvCompania>
      <RutReceptor xsi:type="xsd:string">${params.rutReceptor}</RutReceptor>
      <DvReceptor xsi:type="xsd:string">${params.dvReceptor}</DvReceptor>
      <TipoDte xsi:type="xsd:string">${params.tipoDte}</TipoDte>
      <FolioDte xsi:type="xsd:string">${params.folioDte}</FolioDte>
      <FechaEmisionDte xsi:type="xsd:string">${params.fechaEmision}</FechaEmisionDte>
      <MontoDte xsi:type="xsd:string">${params.montoDte}</MontoDte>
      <Token xsi:type="xsd:string">${params.token}</Token>
    </m:getEstDte>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
}

/**
 * Parse the SII SOAP response to extract status fields.
 */
export function parseSOAPResponse(xmlString) {
  try {
    // Decode HTML entities first
    let decoded = xmlString
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&amp;/g, "&");

    const extract = (tag) => {
      const match = decoded.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "i"));
      return match ? match[1].trim() : "";
    };

    const estado = extract("ESTADO");
    const glosa = extract("GLOSA");
    const errCode = extract("ERR_CODE");
    const glosaErr = extract("GLOSA_ERR");
    const numAtencion = extract("NUM_ATENCION");

    const statusInfo = SII_STATUS[estado] || { label: glosa || "Estado desconocido", severity: "warn" };

    return {
      success: true,
      estado,
      glosa,
      errCode,
      glosaErr,
      numAtencion,
      severity: statusInfo.severity,
      statusLabel: statusInfo.label,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Prepare query parameters from an expense record.
 * @param {Object} expense     - The expense object
 * @param {string} rutConsultante - Your company RUT (consultante = who's asking)
 * @param {string} rutReceptor - Your company RUT (receptor = who received the doc)
 */
export function expenseToQueryParams(expense, rutConsultante, rutReceptor) {
  const docType = expense.documentType || "sin_respaldo";
  const siiType = SII_DTE_TYPES[docType];
  if (!siiType || siiType.code === 0) return null; // not queryable

  // Provider/Emisor RUT
  const emisorRaw = cleanRut(expense.documentProvider || expense.vendor || "");
  if (emisorRaw.length < 2) return null;
  const emisorBody = emisorRaw.slice(0, -1);
  const emisorDV = emisorRaw.slice(-1);

  // Consultante RUT
  const consClean = cleanRut(rutConsultante);
  if (consClean.length < 2) return null;
  const consBody = consClean.slice(0, -1);
  const consDV = consClean.slice(-1);

  // Receptor RUT
  const recClean = cleanRut(rutReceptor);
  if (recClean.length < 2) return null;
  const recBody = recClean.slice(0, -1);
  const recDV = recClean.slice(-1);

  // Date: DDMMAAAA
  const dateISO = expense.documentIssuedAt || expense.datePaid || "";
  let fechaEmision = "";
  if (dateISO) {
    const [y, m, d] = dateISO.split("-");
    if (y && m && d) fechaEmision = `${d}${m}${y}`;
  }

  return {
    rutConsultante: consBody,
    dvConsultante: consDV,
    rutEmisor: emisorBody,
    dvEmisor: emisorDV,
    rutReceptor: recBody,
    dvReceptor: recDV,
    tipoDte: String(siiType.code),
    folioDte: (expense.documentNumber || "").trim(),
    fechaEmision,
    montoDte: String(Math.round(expense.amount)),
    token: "", // filled by Edge Function
  };
}

/**
 * Query SII via Supabase Edge Function proxy.
 * The Edge Function handles authentication and SOAP call.
 */
export async function querySIIStatus(supabaseClient, expense, rutEmpresa, claveSII) {
  const params = expenseToQueryParams(expense, rutEmpresa, rutEmpresa);
  if (!params) {
    return { success: false, error: "Documento no consultable en SII (tipo no soportado o datos faltantes)" };
  }

  const clean = cleanRut(rutEmpresa);
  if (clean.length < 2 || !claveSII) {
    return { success: false, error: "Credenciales SII requeridas (RUT + Clave Tributaria)" };
  }

  try {
    const { data, error } = await supabaseClient.functions.invoke("sii-query-dte", {
      body: {
        action: "query",
        rut: clean.slice(0, -1),
        dv: clean.slice(-1),
        clave: claveSII,
        dteParams: params,
      },
    });

    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || "Error del SII");

    return {
      success: true,
      estado: data.estado,
      glosa: data.glosa,
      errCode: data.errCode,
      glosaErr: data.glosaErr,
      numAtencion: data.numAtencion,
      severity: SII_STATUS[data.estado]?.severity || "warn",
      statusLabel: SII_STATUS[data.estado]?.label || data.glosa || "Estado desconocido",
    };
  } catch (err) {
    return { success: false, error: err.message || "Error consultando SII" };
  }
}

/**
 * Quick status badge for UI rendering.
 */
export function validationBadge(status) {
  switch (status) {
    case "ok":       return { icon: "✅", cls: "ok",   text: "Válido" };
    case "warning":  return { icon: "⚠️", cls: "warn", text: "Advertencia" };
    case "error":    return { icon: "❌", cls: "bad",  text: "Error" };
    case "sin_doc":  return { icon: "📋", cls: "",     text: "Sin doc" };
    case "sii_ok":   return { icon: "🟢", cls: "ok",   text: "SII OK" };
    case "sii_warn": return { icon: "🟡", cls: "warn", text: "SII Warn" };
    case "sii_bad":  return { icon: "🔴", cls: "bad",  text: "SII Error" };
    case "pending":  return { icon: "⏳", cls: "",     text: "Pendiente" };
    default:         return { icon: "—",  cls: "",     text: "—" };
  }
}
