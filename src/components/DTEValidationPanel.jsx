import React, { useState, useMemo, useCallback } from "react";
import { Section, PaginationFooter } from "./shared";
import { usePagination } from "../hooks/usePagination";
import { clp, documentTypeLabel, formatRut, cleanRut, validarRut } from "../utils";
import {
  batchValidate,
  validationBadge,
  SII_DTE_TYPES,
  SII_STATUS,
  expenseToQueryParams,
} from "../dteValidator";
import { supabase } from "../supabaseClient";

export default function DTEValidationPanel({ state, updateExpense }) {
  const [validated, setValidated] = useState(null);
  const [siiResults, setSiiResults] = useState(new Map());
  const [siiLoading, setSiiLoading] = useState(new Set());
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [rutPersonal, setRutPersonal] = useState("");
  const [claveSII, setClaveSII] = useState("");
  const [siiConnected, setSiiConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionMsg, setConnectionMsg] = useState(null);

  // ── SII document fetching ──
  const [siiDocuments, setSiiDocuments] = useState([]);
  const [fetchingDocs, setFetchingDocs] = useState(false);
  const [selectedPeriodo, setSelectedPeriodo] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [docFetchMsg, setDocFetchMsg] = useState(null);

  const rutEmpresa = (state.settings?.rutEmpresa || "").trim();
  const rutPersonalValid = rutPersonal ? validarRut(rutPersonal) : null;

  // ── Batch local validation ──
  const handleValidate = useCallback(() => {
    const result = batchValidate(state.expenses);
    setValidated(result);
    setPage(1);
  }, [state.expenses]);

  // ── Connect to SII (personal RUT + Clave) ──
  const handleConnect = useCallback(async () => {
    if (!rutPersonal) {
      setConnectionMsg({ ok: false, text: "Ingrese su RUT personal (representante legal)" });
      return;
    }
    if (!validarRut(rutPersonal)) {
      setConnectionMsg({ ok: false, text: "RUT personal inválido" });
      return;
    }
    if (!claveSII) {
      setConnectionMsg({ ok: false, text: "Ingrese su Clave Tributaria del SII" });
      return;
    }
    if (!rutEmpresa) {
      setConnectionMsg({ ok: false, text: "Configure el RUT empresa en Configuración → Datos de la Empresa" });
      return;
    }
    const clean = cleanRut(rutPersonal);
    const rut = clean.slice(0, -1);
    const dv = clean.slice(-1);
    setConnecting(true);
    setConnectionMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("sii-query-dte", {
        body: { action: "auth", rut, dv, clave: claveSII },
      });
      if (error) throw error;
      if (data?.ok) {
        setSiiConnected(true);
        const cookieInfo = data?.cookieCount ? ` (${data.cookieCount} cookies)` : "";
        setConnectionMsg({ ok: true, text: (data?.message || `Conectado al SII como ${formatRut(rutPersonal)}`) + cookieInfo });
        // Auto-validar egresos al conectar
        const result = batchValidate(state.expenses);
        setValidated(result);
        setPage(1);
      } else {
        setSiiConnected(false);
        const errText = data?.error || "Error de autenticación";
        const errCode = data?.errorCode ? ` (Código: ${data.errorCode})` : "";
        setConnectionMsg({ ok: false, text: errText + errCode });
      }
    } catch (err) {
      setSiiConnected(false);
      const msg = err.message || "Error de conexión";
      if (msg.includes("not found") || msg.includes("404") || msg.includes("FunctionsHttpError") || msg.includes("FunctionsRelayError")) {
        setConnectionMsg({ ok: false, text: "Edge Function no desplegada. Contacte al administrador." });
      } else {
        setConnectionMsg({ ok: false, text: msg });
      }
    } finally {
      setConnecting(false);
    }
  }, [rutPersonal, claveSII, rutEmpresa, state.expenses]);

  // ── Fetch real documents from SII ──
  const handleFetchDocuments = useCallback(async () => {
    if (!siiConnected || !rutPersonal || !claveSII) {
      setDocFetchMsg({ ok: false, text: "Primero conecte al SII." });
      return;
    }
    if (!rutEmpresa) {
      setDocFetchMsg({ ok: false, text: "Configure el RUT empresa en Configuración." });
      return;
    }

    const cleanPersonal = cleanRut(rutPersonal);
    const rut = cleanPersonal.slice(0, -1);
    const dv = cleanPersonal.slice(-1);

    const cleanEmp = cleanRut(rutEmpresa);
    const rutE = cleanEmp.slice(0, -1);
    const dvE = cleanEmp.slice(-1);

    const periodo = selectedPeriodo.replace("-", ""); // "2025-01" → "202501"

    setFetchingDocs(true);
    setDocFetchMsg(null);
    setSiiDocuments([]);

    try {
      const { data, error } = await supabase.functions.invoke("sii-query-dte", {
        body: {
          action: "fetch-dtes",
          rut, dv,
          clave: claveSII,
          rutEmpresa: rutE,
          dvEmpresa: dvE,
          periodo,
        },
      });
      if (error) throw error;

      if (data?.ok && data.documents?.length > 0) {
        setSiiDocuments(data.documents);
        setDocFetchMsg({
          ok: true,
          text: `Se encontraron ${data.documents.length} documentos (vía ${data.method || "SII"})`,
        });
      } else {
        setSiiDocuments([]);
        setDocFetchMsg({
          ok: false,
          text: data?.error || "No se encontraron documentos para este período.",
          attempts: data?.attempts || [],
          spaInfo: data?.spaInfo || null,
        });
      }
    } catch (err) {
      setDocFetchMsg({
        ok: false,
        text: err.message || "Error consultando documentos del SII.",
      });
    } finally {
      setFetchingDocs(false);
    }
  }, [siiConnected, rutPersonal, claveSII, rutEmpresa, selectedPeriodo]);

  // ── Filtered list ──
  const validatedList = useMemo(() => {
    if (!validated) return [];
    return state.expenses
      .map(exp => ({
        ...exp,
        validation: validated.results.get(exp.id),
      }))
      .filter(exp => {
        if (!exp.validation) return false;
        if (filter === "all") return true;
        return exp.validation.status === filter;
      });
  }, [validated, state.expenses, filter]);

  const pager = usePagination(validatedList, page, 12);

  // ── Summary stats ──
  const summary = validated?.summary;

  // ── SII query for a single expense (REAL) ──
  const handleSIIQuery = useCallback(async (expense) => {
    if (!siiConnected || !rutPersonal || !claveSII) {
      alert("Primero conecte al SII con su RUT personal y Clave Tributaria.");
      return;
    }

    const params = expenseToQueryParams(expense, rutEmpresa, rutEmpresa);
    if (!params) {
      setSiiResults(prev => new Map(prev).set(expense.id, {
        success: false,
        error: "Documento no consultable (tipo no soportado o datos faltantes)",
      }));
      return;
    }

    // Auth con RUT personal, consulta con RUT empresa
    const clean = cleanRut(rutPersonal);
    const rut = clean.slice(0, -1);
    const dv = clean.slice(-1);

    setSiiLoading(prev => new Set(prev).add(expense.id));

    try {
      const { data, error } = await supabase.functions.invoke("sii-query-dte", {
        body: { action: "query", rut, dv, clave: claveSII, dteParams: params },
      });
      if (error) throw error;

      const result = {
        success: data?.ok || false,
        estado: data?.estado || "",
        glosa: data?.glosa || "",
        errCode: data?.errCode || "",
        glosaErr: data?.glosaErr || data?.error || "",
        numAtencion: data?.numAtencion || "",
        severity: data?.estado ? (SII_STATUS[data.estado]?.severity || "warn") : "bad",
        statusLabel: data?.estado ? (SII_STATUS[data.estado]?.label || data.glosa) : (data?.error || "Error"),
        method: data?.method || "",
      };

      setSiiResults(prev => new Map(prev).set(expense.id, result));

      if (result.success && result.estado) {
        updateExpense(expense.id, {
          siiStatus: result.estado,
          siiGlosa: result.glosaErr || result.glosa,
          siiCheckedAt: new Date().toISOString(),
          siiNumAtencion: result.numAtencion,
        });
      }
    } catch (err) {
      setSiiResults(prev => new Map(prev).set(expense.id, {
        success: false,
        error: err.message || "Error consultando SII",
      }));
    } finally {
      setSiiLoading(prev => {
        const next = new Set(prev);
        next.delete(expense.id);
        return next;
      });
    }
  }, [rutPersonal, rutEmpresa, claveSII, siiConnected, updateExpense]);

  // ── Check if expense is queryable on SII ──
  const isQueryable = (exp) => {
    const dt = exp.documentType || "sin_respaldo";
    const siiType = SII_DTE_TYPES[dt];
    return siiType && siiType.code > 0 && exp.documentNumber;
  };

  // ── DTE type code to label ──
  const tipoDocLabel = (code) => {
    const c = String(code);
    const map = { "33": "Factura Electrónica", "34": "Factura Exenta", "39": "Boleta Electrónica", "41": "Boleta Exenta", "46": "Factura Compra", "56": "Nota Débito", "61": "Nota Crédito", "110": "Factura Exportación", "112": "NC Exportación" };
    return map[c] || c || "—";
  };

  return (
    <div style={{ marginTop: 12 }}>
      {/* ── SII Connection (FIRST) ── */}
      <Section
        title={<>🔌 Conexión SII&nbsp;{siiConnected ? <span style={{ color: "#16a34a", fontSize: 13 }}>● Conectado</span> : <span style={{ color: "#dc2626", fontSize: 13 }}>● Desconectado</span>}</>}
        right={
          <button
            className={siiConnected ? "ghost" : "primary"}
            onClick={handleConnect}
            disabled={connecting}
            style={{ minWidth: 140 }}
          >
            {connecting ? "⏳ Verificando…" : siiConnected ? "🔄 Reconectar" : "🔌 Conectar al SII"}
          </button>
        }
      >
        <div className="muted" style={{ marginBottom: 10 }}>
          Inicie sesión con su <b>RUT personal</b> (representante legal) y <b>Clave Tributaria</b> del SII.
          Las credenciales se usan <b>solo durante esta sesión</b> y <b>no se almacenan</b>.
        </div>
        <div className="formGrid" style={{ maxWidth: 540 }}>
          <label>
            RUT Personal (representante legal)
            <input
              value={rutPersonal}
              placeholder="Ej: 12.345.678-5"
              onChange={(e) => { setRutPersonal(e.target.value); setSiiConnected(false); setConnectionMsg(null); }}
              style={rutPersonalValid === false ? { borderColor: '#ef4444' } : rutPersonalValid === true ? { borderColor: '#10b981' } : {}}
              autoComplete="off"
            />
            {rutPersonalValid === false && <span className="fieldError">RUT inválido</span>}
            {rutPersonalValid === true && <span style={{ color: '#10b981', fontSize: 11, fontWeight: 600 }}>✓ {formatRut(rutPersonal)}</span>}
          </label>
          <label>
            Clave Tributaria SII
            <input
              type="password"
              value={claveSII}
              onChange={(e) => { setClaveSII(e.target.value); setSiiConnected(false); setConnectionMsg(null); }}
              placeholder="La misma clave de sii.cl"
              autoComplete="off"
            />
          </label>
          <label>
            RUT Empresa (a consultar)
            <input
              value={rutEmpresa ? formatRut(rutEmpresa) : ""}
              disabled
              placeholder="Configure en Configuración →"
              style={{ opacity: 0.7 }}
            />
            {!rutEmpresa && <span className="fieldError">Configure en Configuración → Datos de la Empresa</span>}
          </label>
        </div>
        {connectionMsg && (
          <div style={{
            marginTop: 10, padding: "8px 12px", borderRadius: 6, fontSize: 13, fontWeight: 500,
            background: connectionMsg.ok ? "#dcfce7" : "#fef2f2",
            color: connectionMsg.ok ? "#166534" : "#991b1b",
          }}>
            {connectionMsg.ok ? "✅" : "❌"} {connectionMsg.text}
            {connectionMsg.ok && <span style={{ marginLeft: 8, fontSize: 12, color: "#64748b" }}>— Se validaron automáticamente {state.expenses.length} egresos</span>}
          </div>
        )}
      </Section>

      {/* ── SII Documents (fetch real DTEs) ── */}
      {siiConnected && (
        <Section
          title={<>📄 Documentos Tributarios del SII <span className="muted" style={{ fontSize: 12 }}>({selectedPeriodo})</span></>}
          right={
            <button
              className="primary"
              onClick={handleFetchDocuments}
              disabled={fetchingDocs}
              style={{ minWidth: 180 }}
            >
              {fetchingDocs ? "⏳ Consultando SII…" : "📄 Consultar DTEs del SII"}
            </button>
          }
        >
          <div className="muted" style={{ marginBottom: 10 }}>
            Consulte los documentos tributarios electrónicos (facturas, boletas, notas de crédito) registrados en el SII para su empresa.
          </div>
          <div className="formGrid" style={{ maxWidth: 320, marginBottom: 12 }}>
            <label>
              Período tributario
              <input
                type="month"
                value={selectedPeriodo}
                onChange={(e) => setSelectedPeriodo(e.target.value)}
              />
            </label>
          </div>

          {docFetchMsg && (
            <div style={{
              padding: "8px 12px", borderRadius: 6, fontSize: 13, fontWeight: 500, marginBottom: 12,
              background: docFetchMsg.ok ? "#dcfce7" : "#fef2f2",
              color: docFetchMsg.ok ? "#166534" : "#991b1b",
            }}>
              {docFetchMsg.ok ? "✅" : "⚠️"} {docFetchMsg.text}
            </div>
          )}

          {siiDocuments.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Tipo DTE</th>
                    <th>Folio</th>
                    <th>Emisor / Razón Social</th>
                    <th>RUT Emisor</th>
                    <th>Fecha</th>
                    <th>Monto</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {siiDocuments.map((doc, i) => {
                    // Normalize document fields (SII may use various key names)
                    const tipo = doc.tipo || doc.tipoDte || doc.codTipoDoc || doc.tipo_dte || doc.tipoDoc || "";
                    const folio = doc.folio || doc.folioDte || doc.nroDoc || doc.folio_dte || doc.numero || "";
                    const emisor = doc.razonSocial || doc.razon_social || doc.emisor || doc.rzn_social || "";
                    const rutEmisor = doc.rut_emisor || doc.rutEmisor || doc.rut || "";
                    const dvEmisor = doc.dv_emisor || doc.dvEmisor || doc.dv || "";
                    const fecha = doc.fechaEmision || doc.fecha || doc.fchEmision || doc.fecha_emision || doc.fch_emision || "";
                    const monto = doc.montoTotal || doc.monto || doc.mnt_total || doc.montoNeto || doc.monto_total || "";
                    const estado = doc.estado || doc.estadoContab || doc.estado_contab || doc.estadoDte || "";

                    return (
                      <tr key={i}>
                        <td className="small"><b>{tipoDocLabel(tipo)}</b></td>
                        <td>{folio || "—"}</td>
                        <td style={{ maxWidth: 200 }}>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{emisor || "—"}</div>
                        </td>
                        <td className="small muted">{rutEmisor}{dvEmisor ? `-${dvEmisor}` : ""}</td>
                        <td className="small">{fecha || "—"}</td>
                        <td className="amountRed">{monto ? `$${clp(Number(String(monto).replace(/[^\d]/g, "")))}` : "—"}</td>
                        <td className="small">{estado || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : docFetchMsg && !docFetchMsg.ok ? (
            <div style={{ textAlign: "left", padding: 16 }}>
              <div style={{ textAlign: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 30, marginBottom: 8 }}>🔍</div>
                <div className="muted">No se encontraron documentos. Se están descubriendo los endpoints reales del SII.</div>
              </div>

              {/* Diagnóstico técnico — siempre visible */}
              {docFetchMsg.attempts?.length > 0 && (
                <details open style={{ marginTop: 8 }}>
                  <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>🔧 Diagnóstico ({docFetchMsg.attempts.length} endpoints probados)</summary>
                  <div style={{ fontSize: 11, marginTop: 8, maxHeight: 400, overflow: "auto", background: "#f8fafc", padding: 8, borderRadius: 6 }}>
                    {docFetchMsg.attempts.map((a, i) => {
                      const bgColor = a.note?.includes("found") || a.note?.includes("scraped")
                        ? "#dcfce7"
                        : a.status === 200 ? "#f0fdf4"
                        : a.note === "needs-login" || a.note === "redirect" ? "#fffbeb"
                        : a.error ? "#fef2f2"
                        : "#f1f5f9";
                      return (
                        <div key={i} style={{ marginBottom: 4, padding: "4px 6px", borderRadius: 4, background: bgColor }}>
                          <div>
                            <b>{a.name}</b>
                            {a.url && <span className="muted" style={{ fontSize: 10, marginLeft: 4 }}>{a.url}</span>}
                            {": "}
                            {a.status ? <span style={{ fontWeight: 600 }}>HTTP {a.status}</span> : <span style={{ color: "#dc2626" }}>{a.error || "?"}</span>}
                            {a.note && <span className="muted"> — {a.note}</span>}
                            {a.type && <span className="muted"> [{a.type}]</span>}
                            {a.len !== undefined && <span className="muted"> {a.len}b</span>}
                          </div>
                          {a.sample && (
                            <div style={{ fontSize: 10, marginTop: 2, fontFamily: "monospace", wordBreak: "break-all", color: "#475569", background: "#e2e8f0", padding: "2px 4px", borderRadius: 3 }}>
                              {a.sample.substring(0, 300)}
                            </div>
                          )}
                          {a.location && <div className="muted" style={{ fontSize: 10 }}>→ {a.location}</div>}
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}

              {/* SPA discovery info */}
              {docFetchMsg.spaInfo && Object.keys(docFetchMsg.spaInfo).length > 0 && (
                <details open style={{ marginTop: 8 }}>
                  <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>🌐 Descubrimiento de APIs del SII</summary>
                  <div style={{ fontSize: 11, marginTop: 4, padding: 8, background: "#f8fafc", borderRadius: 6 }}>
                    {Object.entries(docFetchMsg.spaInfo).map(([key, val]) => {
                      if (key === "discoveredPaths") {
                        const paths = val;
                        return (
                          <div key={key} style={{ marginTop: 4 }}>
                            <b>APIs descubiertas en bundles JS ({paths.length}):</b>
                            {paths.map((p, i) => (
                              <div key={i} style={{ fontFamily: "monospace", fontSize: 10, color: "#2563eb", marginLeft: 8 }}>{p}</div>
                            ))}
                          </div>
                        );
                      }
                      if (key === "discoveryError") return <div key={key} style={{ color: "#dc2626" }}>Error: {val}</div>;
                      if (typeof val === "object") {
                        return (
                          <div key={key} style={{ marginBottom: 4 }}>
                            <b>{key}:</b> auth={val.auth ? "✅" : "❌"} scripts={val.scripts} html={val.htmlSize}b
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </details>
              )}

              {docFetchMsg.hint && (
                <div className="muted" style={{ marginTop: 8, fontSize: 11, fontStyle: "italic" }}>💡 {docFetchMsg.hint}</div>
              )}
            </div>
          ) : !docFetchMsg ? (
            <div style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>📋</div>
              <div>Seleccione un período y presione <b>"Consultar DTEs del SII"</b> para ver los documentos tributarios de su empresa.</div>
            </div>
          ) : null}
        </Section>
      )}

      {/* ── Run validation ── */}
      <Section
        title="🔍 Validación de Documentos Tributarios"
        right={
          <button className="primary" onClick={handleValidate}>
            {validated ? "🔄 Re-validar" : "▶ Validar egresos"}
          </button>
        }
      >
        <div className="muted" style={{ marginBottom: 12 }}>
          Verifica la integridad de los documentos de respaldo (RUT, folio, fecha, duplicados).
          {siiConnected ? " Conectado al SII — puede consultar estado de cada documento." : " Conecte al SII arriba para verificar documentos en línea."}
        </div>

        {!validated && (
          <div style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
            <div>Presiona <b>"Validar egresos"</b> para analizar {state.expenses.length} egresos registrados</div>
            {siiConnected && <div style={{ marginTop: 8, color: "#16a34a", fontWeight: 600 }}>🟢 Conectado al SII — los resultados se validan automáticamente al conectar</div>}
          </div>
        )}
      </Section>

      {/* ── Summary ── */}
      {validated && summary && (
        <>
          <Section title="📊 Resumen de validación">
            <div className="kpis" style={{ marginBottom: 12 }}>
              <div className="kpi kpi--green" onClick={() => { setFilter("ok"); setPage(1); }} style={{ cursor: "pointer" }}>
                <div className="label">✅ Válidos</div>
                <div className="value">{summary.ok}</div>
              </div>
              <div className="kpi kpi--orange" onClick={() => { setFilter("warning"); setPage(1); }} style={{ cursor: "pointer" }}>
                <div className="label">⚠️ Advertencias</div>
                <div className="value">{summary.warnings}</div>
              </div>
              <div className="kpi kpi--red" onClick={() => { setFilter("error"); setPage(1); }} style={{ cursor: "pointer" }}>
                <div className="label">❌ Errores</div>
                <div className="value">{summary.errors}</div>
              </div>
              <div className="kpi" onClick={() => { setFilter("sin_doc"); setPage(1); }} style={{ cursor: "pointer" }}>
                <div className="label">📋 Sin documento</div>
                <div className="value">{summary.sinDocumento}</div>
              </div>
            </div>

            {validated.duplicates.length > 0 && (
              <div className="alertItem alertItem--warning" style={{ marginBottom: 8 }}>
                <span className="alertIcon">⚠️</span>
                <div className="alertContent">
                  <div className="alertTitle">Documentos duplicados detectados: {validated.duplicates.length}</div>
                  <div className="alertDetail">
                    {validated.duplicates.map((d, i) => (
                      <div key={i}>{documentTypeLabel(d.docType)} #{d.docNumber} — {d.count} registros</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="row" style={{ gap: 6 }}>
              {[
                { value: "all", label: `Todos (${summary.total})` },
                { value: "ok", label: `Válidos (${summary.ok})` },
                { value: "warning", label: `Advertencias (${summary.warnings})` },
                { value: "error", label: `Errores (${summary.errors})` },
                { value: "sin_doc", label: `Sin doc (${summary.sinDocumento})` },
              ].map(f => (
                <button
                  key={f.value}
                  className={"pill " + (filter === f.value ? "active" : "")}
                  onClick={() => { setFilter(f.value); setPage(1); }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </Section>

          {/* ── Detail table ── */}
          <Section title={`Detalle — ${validatedList.length} egresos`}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th>Documento</th>
                  <th>Monto</th>
                  <th>Estado local</th>
                  <th>SII</th>
                  <th>Detalles</th>
                </tr>
              </thead>
              <tbody>
                {pager.pageItems.map(exp => {
                  const v = exp.validation;
                  const badge = validationBadge(v?.status);
                  const siiResult = siiResults.get(exp.id) || (exp.siiStatus ? { success: true, estado: exp.siiStatus, glosaErr: exp.siiGlosa, simulated: false } : null);
                  const siiSeverity = siiResult?.success ? (SII_STATUS[siiResult.estado]?.severity || "warn") : null;
                  const siiChecked = exp.siiCheckedAt;
                  const loading = siiLoading.has(exp.id);
                  const queryable = isQueryable(exp);

                  return (
                    <tr key={exp.id}>
                      <td className="small">{exp.datePaid}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{exp.vendor || "—"}</div>
                        {(exp.documentProvider && cleanRut(exp.documentProvider).length > 1) && (
                          <div className="small muted">{formatRut(exp.documentProvider)}</div>
                        )}
                      </td>
                      <td>
                        <div className="small">
                          <b>{documentTypeLabel(exp.documentType || "sin_respaldo")}</b>
                        </div>
                        {exp.documentNumber && (
                          <div className="small muted">N° {exp.documentNumber}</div>
                        )}
                      </td>
                      <td className="amountRed">${clp(exp.amount)}</td>
                      <td>
                        <span className={"badge " + badge.cls} style={{ fontSize: 11 }}>
                          {badge.icon} {badge.text}
                        </span>
                      </td>
                      <td>
                        {loading ? (
                          <span className="small muted">⏳ Consultando…</span>
                        ) : siiResult ? (
                          <div>
                            {siiResult.success ? (
                              <span className={"badge " + (siiSeverity || "")} style={{ fontSize: 11 }}>
                                {siiSeverity === "ok" ? "🟢" : siiSeverity === "warn" ? "🟡" : siiSeverity === "bad" ? "🔴" : "—"}{" "}
                                {siiResult.estado}
                              </span>
                            ) : (
                              <span className="badge bad" style={{ fontSize: 11 }} title={siiResult.error || siiResult.glosaErr || ""}>
                                🔴 {siiResult.error ? siiResult.error.substring(0, 50) : "Error"}
                              </span>
                            )}
                            {siiResult.method && <div className="small muted" style={{ fontSize: 10 }}>vía {siiResult.method}</div>}
                            {siiChecked && <div className="small muted" style={{ fontSize: 10 }}>{new Date(siiChecked).toLocaleDateString("es-CL")}</div>}
                          </div>
                        ) : queryable ? (
                          <button
                            className="ghost"
                            style={{ fontSize: 11, padding: "4px 8px" }}
                            onClick={() => handleSIIQuery(exp)}
                            disabled={!siiConnected}
                            title={!siiConnected ? "Conecte al SII primero" : "Consultar estado en SII"}
                          >
                            🔎 SII
                          </button>
                        ) : (
                          <span className="small muted">—</span>
                        )}
                      </td>
                      <td>
                        {v?.errors.length > 0 && (
                          <div>{v.errors.map((e, i) => <div key={i} className="small" style={{ color: "#dc2626" }}>❌ {e}</div>)}</div>
                        )}
                        {v?.warnings.length > 0 && (
                          <div>{v.warnings.map((w, i) => <div key={i} className="small" style={{ color: "#d97706" }}>⚠️ {w}</div>)}</div>
                        )}
                        {v?.errors.length === 0 && v?.warnings.length === 0 && v?.status !== "sin_doc" && (
                          <span className="small" style={{ color: "#16a34a" }}>✓ Sin observaciones</span>
                        )}
                        {siiResult?.glosaErr && (
                          <div className="small muted" style={{ marginTop: 2 }}>SII: {siiResult.glosaErr}</div>
                        )}
                        {!siiResult?.success && siiResult?.error && !siiResult?.glosaErr && (
                          <div className="small" style={{ marginTop: 2, color: "#dc2626" }}>SII: {siiResult.error}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {validatedList.length === 0 && (
                  <tr><td colSpan={7} className="small">Sin resultados para este filtro.</td></tr>
                )}
              </tbody>
            </table>
            <PaginationFooter pager={pager} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => p + 1)} />
          </Section>

          {/* ── SII Status Legend ── */}
          <Section title="📖 Códigos de estado SII">
            <div className="muted" style={{ marginBottom: 8 }}>
              Referencia: estados que devuelve el Web Service QueryEstDte del SII.
            </div>
            <table>
              <thead>
                <tr><th>Código</th><th>Significado</th><th>Gravedad</th></tr>
              </thead>
              <tbody>
                {Object.entries(SII_STATUS).map(([code, info]) => (
                  <tr key={code}>
                    <td><b>{code}</b></td>
                    <td>{info.label}</td>
                    <td><span className={"badge " + info.severity}>{info.severity === "ok" ? "OK" : info.severity === "warn" ? "Precaución" : "Error"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </>
      )}
    </div>
  );
}
