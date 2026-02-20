/**
 * Supabase Edge Function: sii-query-dte
 *
 * Integración REAL con el SII de Chile.
 *
 * Acciones:
 *   "auth"      → Login real en SII (zeusr.sii.cl) + obtener cookies de sesión
 *   "query"     → Verificar un DTE (web scraping con sesión autenticada + SOAP + público)
 *   "diagnose"  → Diagnóstico de conectividad
 *
 * Flujo real del SII (descubierto del JS/HTML oficial):
 *   1. POST a https://zeusr.sii.cl/cgi_AUT2000/CAutInicio.cgi
 *      Campos: rut, dv, referencia, 411, rutcntr, clave
 *   2. Éxito → 302 redirect + Set-Cookie (TOKEN, RUT_NS, DV_NS, etc.)
 *   3. Error → 200 con HTML y <div id="titulo"> con mensaje de error
 *   4. Con cookies, acceder a palena.sii.cl para verificar DTEs
 *
 * La clave NO se almacena — solo vive durante la ejecución.
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, rut, dv, clave, dteParams } = body;

    // ── auth: verificar credenciales SII ──
    if (action === "auth") {
      if (!rut || !dv || !clave) {
        return jsonOk({ ok: false, error: "RUT y Clave Tributaria requeridos" });
      }
      const auth = await siiLogin(rut, dv, clave);
      return jsonOk(auth);
    }

    // ── query: verificar un DTE ──
    if (action === "query") {
      if (!dteParams) {
        return jsonOk({ ok: false, error: "Parámetros del DTE requeridos" });
      }

      // Estrategia 1: Verificación con autenticación (web scraping + SOAP)
      if (rut && dv && clave) {
        const auth = await siiLogin(rut, dv, clave);
        if (auth.ok && auth.cookies) {
          // Intentar verificación web con cookies
          const webResult = await verifyDTEWeb(auth.cookies, dteParams);
          if (webResult.ok) return jsonOk(webResult);

          // Intentar SOAP con TOKEN cookie como Token
          const soapResult = await verifyDTESOAP(auth.tokenValue || "", dteParams, rut, dv);
          if (soapResult.ok) return jsonOk(soapResult);
        }
      }

      // Estrategia 2: Verificación pública (form-based CGI, sin auth)
      const publicResult = await verifyDTEPublicCGI(dteParams);
      if (publicResult.ok) return jsonOk(publicResult);

      // Sin resultado
      return jsonOk({
        ok: false,
        error: "No se pudo verificar el DTE. Verifique los datos del documento.",
        details: publicResult.error || "El SII no devolvió un estado claro.",
      });
    }

    // ── fetch-dtes: obtener documentos tributarios del SII (RCV) ──
    if (action === "fetch-dtes") {
      if (!rut || !dv || !clave) {
        return jsonOk({ ok: false, error: "Credenciales requeridas" });
      }
      const { rutEmpresa, dvEmpresa, periodo } = body;
      if (!rutEmpresa || !dvEmpresa) {
        return jsonOk({ ok: false, error: "RUT empresa requerido (configure en Configuración)" });
      }
      const per = periodo || getCurrentPeriodo();

      const auth = await siiLogin(rut, dv, clave);
      if (!auth.ok || !auth.cookies) {
        return jsonOk({ ok: false, error: auth.error || "Error de autenticación" });
      }

      const result = await fetchSIIDocuments(auth.cookies, rutEmpresa, dvEmpresa, per);
      return jsonOk(result);
    }

    // ── diagnose: diagnóstico de conectividad ──
    if (action === "diagnose") {
      return await runDiagnostics(rut, dv, clave);
    }

    return jsonOk({ ok: false, error: "Acción no válida. Use 'auth', 'query' o 'diagnose'" });

  } catch (err: any) {
    console.error("Edge Function error:", err);
    return jsonOk({ ok: false, error: `Error interno: ${err.message}` });
  }
});

// ─────────────────────────────────────────────
function jsonOk(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ═══════════════════════════════════════════════
// 1. SII LOGIN — Endpoint correcto: CAutInicio.cgi
// ═══════════════════════════════════════════════

async function siiLogin(rut: string, dv: string, clave: string): Promise<any> {
  try {
    // El formulario real del SII está en:
    // https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html
    // Envía POST a: /cgi_AUT2000/CAutInicio.cgi
    const authUrl = "https://zeusr.sii.cl/cgi_AUT2000/CAutInicio.cgi";

    // Formatear rutcntr con puntos y guión: "16.941.094-1"
    const rutcntr = formatRutDots(rut, dv);

    // Referencia: URL a la que redirige después del login exitoso
    const referencia = "https://misiir.sii.cl/cgi_misii/siihome.cgi";

    const formBody = new URLSearchParams({
      rut,         // Cuerpo numérico del RUT (sin DV, sin puntos)
      dv,          // Dígito verificador
      referencia,  // URL de retorno tras login exitoso
      "411": "",   // Campo oculto con name="411" (código interno)
      rutcntr,     // RUT formateado con puntos (visible en form)
      clave,       // Clave Tributaria
    });

    console.log(`[AUTH] POST ${authUrl} — RUT ${rut}-${dv} (rutcntr=${rutcntr})`);

    const response = await fetch(authUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html",
        "Origin": "https://zeusr.sii.cl",
      },
      body: formBody.toString(),
      redirect: "manual",
    });

    console.log(`[AUTH] Response status: ${response.status}`);

    // ── Recoger TODAS las cookies ──
    const allCookies: string[] = [];
    let tokenValue = "";

    collectCookies(response, allCookies, (name, val) => {
      if (name.toUpperCase() === "TOKEN") tokenValue = val;
    });

    const html = await response.text();

    console.log(`[AUTH] Cookies (${allCookies.length}): ${allCookies.map(c => c.split("=")[0]).join(", ")}`);
    console.log(`[AUTH] TOKEN: ${tokenValue ? tokenValue.substring(0, 20) + "..." : "(no)"}`);
    console.log(`[AUTH] Response length: ${html.length} chars`);

    // ── CASO: 302 redirect ──
    if (response.status === 301 || response.status === 302) {
      const location = response.headers.get("location") || "";
      const locLower = location.toLowerCase();

      // Redirect a errorp.html = error de auth
      if (locLower.includes("error") || locLower.includes("errorp")) {
        console.log(`[AUTH] ❌ Redirect a error: ${location}`);
        return {
          ok: false, authenticated: false,
          error: "Credenciales incorrectas. Verifique su RUT personal y Clave Tributaria.",
        };
      }

      // Seguir el redirect para obtener cookies adicionales de sesión
      if (location) {
        console.log(`[AUTH] Siguiendo redirect a: ${location}`);
        try {
          const cookieStr1 = allCookies.join("; ");
          const r2 = await fetch(location, {
            headers: { "User-Agent": UA, "Cookie": cookieStr1 },
            redirect: "manual",
          });
          collectCookies(r2, allCookies, (name, val) => {
            if (name.toUpperCase() === "TOKEN") tokenValue = val;
          });
          console.log(`[AUTH] Cookies tras redirect (${allCookies.length}): ${allCookies.map(c => c.split("=")[0]).join(", ")}`);
          // Si hay otro redirect, seguirlo también
          const loc2 = r2.headers.get("location") || "";
          if ((r2.status === 301 || r2.status === 302) && loc2 && !loc2.toLowerCase().includes("error")) {
            const cookieStr2 = allCookies.join("; ");
            const r3 = await fetch(loc2, {
              headers: { "User-Agent": UA, "Cookie": cookieStr2 },
              redirect: "manual",
            });
            collectCookies(r3, allCookies, (name, val) => {
              if (name.toUpperCase() === "TOKEN") tokenValue = val;
            });
            console.log(`[AUTH] Cookies tras 2do redirect (${allCookies.length}): ${allCookies.map(c => c.split("=")[0]).join(", ")}`);
          }
        } catch (e: any) {
          console.log(`[AUTH] Error siguiendo redirect: ${e.message}`);
        }
      }

      const cookieStr = allCookies.join("; ");

      // Validar que tenemos cookies de sesión reales
      const hasToken = allCookies.some(c => c.split("=")[0].toUpperCase() === "TOKEN");
      const hasRutNS = allCookies.some(c => c.split("=")[0] === "RUT_NS");

      if (hasToken || hasRutNS || allCookies.length >= 2) {
        console.log(`[AUTH] ✅ Autenticado con ${allCookies.length} cookies`);
        return {
          ok: true, authenticated: true,
          cookies: cookieStr,
          tokenValue,
          cookieCount: allCookies.length,
          message: `Autenticación exitosa en el SII (${allCookies.length} cookies de sesión)`,
        };
      }

      // Redirect a URL válida pero sin cookies = auth dudosa
      console.log(`[AUTH] ⚠️ Redirect sin cookies de sesión`);
      return {
        ok: false, authenticated: false,
        error: `El SII redirigió a ${location} pero no entregó cookies de sesión. Verifique su Clave Tributaria.`,
        debug: { redirectTo: location, cookieCount: allCookies.length },
      };
    }

    // ── CASO ÉXITO: 200 pero con TOKEN cookie ──
    const hasToken = allCookies.some(c => {
      const name = c.split("=")[0].toUpperCase();
      return name === "TOKEN" || name === "TOKEN2";
    });

    if (hasToken) {
      console.log("[AUTH] ✅ TOKEN cookie encontrado");
      return {
        ok: true, authenticated: true,
        cookies: allCookies.join("; "),
        tokenValue,
        cookieCount: allCookies.length,
        message: "Autenticación exitosa en el SII",
      };
    }

    // ── CASO ERROR: 200 con HTML de error ──
    // El SII retorna el error en <div id="titulo">mensaje</div>
    const tituloMatch = html.match(/<div\s+id=["']titulo["'][^>]*>([\s\S]*?)<\/div>/i);
    if (tituloMatch) {
      let errorMsg = tituloMatch[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const codeMatch = errorMsg.match(/código.*?es\s+([\d.]+)/i);
      const errorCode = codeMatch ? codeMatch[1] : "";

      console.log(`[AUTH] ❌ Error SII: ${errorMsg}`);

      // Mapear errores comunes
      if (errorMsg.includes("fallecida")) {
        return { ok: false, authenticated: false, error: "RUT corresponde a persona fallecida.", errorCode };
      }
      if (errorMsg.includes("bloqueada") || errorMsg.includes("bloqueado")) {
        return { ok: false, authenticated: false, error: "Cuenta bloqueada en el SII. Desbloquee en www.sii.cl", errorCode };
      }
      if (errorMsg.toLowerCase().includes("clave") && (errorMsg.toLowerCase().includes("incorrecto") || errorMsg.toLowerCase().includes("incorrecta"))) {
        return { ok: false, authenticated: false, error: "Clave Tributaria incorrecta.", errorCode };
      }
      if (errorMsg.toLowerCase().includes("rut") && (errorMsg.includes("no existe") || errorMsg.includes("no válido"))) {
        return { ok: false, authenticated: false, error: "RUT no existe o no es válido.", errorCode };
      }

      return {
        ok: false, authenticated: false,
        error: `Error SII: ${errorMsg.substring(0, 250)}`,
        errorCode,
      };
    }

    // ── CASO: respuesta inesperada ──
    if (html.toLowerCase().includes("transaccion rechazada")) {
      return { ok: false, authenticated: false, error: "El SII rechazó la solicitud. Intente más tarde." };
    }

    return {
      ok: false, authenticated: false,
      error: `Respuesta inesperada del SII (HTTP ${response.status}). Intente más tarde.`,
      debug: { status: response.status, cookies: allCookies.length, snippet: html.substring(0, 300) },
    };

  } catch (err: any) {
    console.error("[AUTH] Error:", err.message);
    if (err.message.includes("dns") || err.message.includes("connect") || err.message.includes("timeout")) {
      return { ok: false, authenticated: false, error: "No se pudo conectar al SII. Verifique su conexión o intente más tarde." };
    }
    return { ok: false, authenticated: false, error: `Error de conexión: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════
// 2. VERIFICACIÓN DTE — Web con cookies de sesión
// ═══════════════════════════════════════════════

async function verifyDTEWeb(cookies: string, params: Record<string, string>): Promise<any> {
  try {
    // Acceder a la página de verificación con cookies de sesión
    const verifyPageUrl = "https://palena.sii.cl/cgi_dte/UPL/DTEauth?2";

    console.log("[WEB] Accediendo a verificación DTE con cookies...");

    const pageResp = await fetch(verifyPageUrl, {
      headers: { "User-Agent": UA, "Cookie": cookies, "Accept": "text/html" },
      redirect: "follow",
    });

    const pageHtml = await pageResp.text();
    console.log(`[WEB] Página: ${pageResp.status}, ${pageHtml.length} chars`);

    // Si redirige a login, las cookies no son válidas
    if (pageHtml.includes("IngresoRutClave") || pageHtml.includes("CAutInicio") ||
        pageHtml.includes("autenticacion_contribuyentes")) {
      console.log("[WEB] Cookies no válidas, redirige a login");
      return { ok: false, error: "Sesión no válida para verificación web" };
    }

    // Formatear fecha
    let fecha = params.fechaEmision || "";
    if (fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [y, m, d] = fecha.split("-");
      fecha = `${d}/${m}/${y}`;
    } else if (fecha.length === 8 && !fecha.includes("/")) {
      fecha = `${fecha.substring(0,2)}/${fecha.substring(2,4)}/${fecha.substring(4)}`;
    }

    // Enviar consulta de verificación
    const verifyForm = new URLSearchParams({
      ESSION: "2",
      RUT_EMP: params.rutEmisor || "",
      DV_EMP: params.dvEmisor || "",
      TIPO_DTE: params.tipoDte || "33",
      FOLIO: params.folioDte || "",
      FECHA_EMIS: fecha,
      MONTO: params.montoDte || "",
      RUT_RECEP: params.rutReceptor || "",
      DV_RECEP: params.dvReceptor || "",
    });

    console.log("[WEB] Enviando consulta DTE...");

    const verifyResp = await fetch("https://palena.sii.cl/cgi_dte/UPL/DTEauth", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
        "Cookie": cookies,
        "Referer": verifyPageUrl,
      },
      body: verifyForm.toString(),
      redirect: "follow",
    });

    const resultHtml = await verifyResp.text();
    console.log(`[WEB] Resultado: ${verifyResp.status}, ${resultHtml.length} chars`);
    console.log(`[WEB] Snippet: ${resultHtml.substring(0, 500)}`);

    const parsed = parseDTEStatusFromHTML(resultHtml);
    if (parsed.found) {
      return {
        ok: true, method: "web-authenticated",
        estado: parsed.code, glosa: parsed.glosa,
        errCode: parsed.errCode || "0", glosaErr: parsed.detail || "",
      };
    }

    return { ok: false, error: "No se pudo interpretar la respuesta de verificación web" };

  } catch (err: any) {
    console.error("[WEB] Error:", err.message);
    return { ok: false, error: `Error en verificación web: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════
// 3. VERIFICACIÓN DTE — SOAP QueryEstDte
// ═══════════════════════════════════════════════

async function verifyDTESOAP(
  token: string,
  params: Record<string, string>,
  rutCons: string,
  dvCons: string
): Promise<any> {
  try {
    const soapXML = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soapenv:Body>
    <getEstDte xmlns="http://DefaultNamespace">
      <RutConsultante xsi:type="xsd:string">${esc(rutCons)}</RutConsultante>
      <DvConsultante xsi:type="xsd:string">${esc(dvCons)}</DvConsultante>
      <RutCompania xsi:type="xsd:string">${esc(params.rutEmisor)}</RutCompania>
      <DvCompania xsi:type="xsd:string">${esc(params.dvEmisor)}</DvCompania>
      <RutReceptor xsi:type="xsd:string">${esc(params.rutReceptor || "")}</RutReceptor>
      <DvReceptor xsi:type="xsd:string">${esc(params.dvReceptor || "")}</DvReceptor>
      <TipoDte xsi:type="xsd:string">${esc(params.tipoDte)}</TipoDte>
      <FolioDte xsi:type="xsd:string">${esc(params.folioDte)}</FolioDte>
      <FechaEmisionDte xsi:type="xsd:string">${esc(params.fechaEmision)}</FechaEmisionDte>
      <MontoDte xsi:type="xsd:string">${esc(params.montoDte)}</MontoDte>
      <Token xsi:type="xsd:string">${esc(token)}</Token>
    </getEstDte>
  </soapenv:Body>
</soapenv:Envelope>`;

    console.log(`[SOAP] QueryEstDte token=${token ? "present" : "empty"}`);

    const resp = await fetch("https://palena.sii.cl/DTEWS/QueryEstDte.jws", {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": '""',
        "User-Agent": UA,
      },
      body: soapXML,
    });

    const xml = await resp.text();
    console.log(`[SOAP] Status: ${resp.status}, Length: ${xml.length}`);

    const decoded = xml
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&amp;/g, "&")
      .replace(/&#xd;/g, "");

    const extract = (tag: string): string => {
      const m = decoded.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "i"));
      return m ? m[1].trim() : "";
    };

    const estado = extract("ESTADO");
    const glosa = extract("GLOSA");

    if (estado) {
      if (estado === "001" && glosa.toUpperCase().includes("TOKEN")) {
        return { ok: false, error: "Token no válido para SOAP" };
      }
      return {
        ok: true, method: "soap",
        estado: mapEstado(estado), glosa,
        errCode: extract("ERR_CODE") || estado,
        glosaErr: extract("GLOSA_ERR") || glosa,
        numAtencion: extract("NUM_ATENCION"),
      };
    }

    return { ok: false, error: extract("faultstring") || "SOAP no devolvió estado" };

  } catch (err: any) {
    return { ok: false, error: `Error SOAP: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════
// 4. VERIFICACIÓN PÚBLICA — CGI form (sin auth)
// ═══════════════════════════════════════════════

async function verifyDTEPublicCGI(params: Record<string, string>): Promise<any> {
  try {
    const url = "https://www.sii.cl/cgi_dte/consultaDteAvBsique.cgi";

    let fecha = params.fechaEmision || "";
    if (fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [y, m, d] = fecha.split("-");
      fecha = `${d}/${m}/${y}`;
    } else if (fecha.length === 8 && !fecha.includes("/")) {
      fecha = `${fecha.substring(0,2)}/${fecha.substring(2,4)}/${fecha.substring(4)}`;
    }

    const formData = new URLSearchParams({
      rutEmisor: params.rutEmisor || "",
      dvEmisor: params.dvEmisor || "",
      tipoDte: params.tipoDte || "33",
      folioDte: params.folioDte || "",
      fechaEmision: fecha,
      montoTotal: params.montoDte || "",
      rutReceptor: params.rutReceptor || "",
      dvReceptor: params.dvReceptor || "",
    });

    console.log("[PUBLIC] Verificación pública CGI...");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
        "Accept": "text/html",
      },
      body: formData.toString(),
    });

    const html = await response.text();
    console.log(`[PUBLIC] Status: ${response.status}, Length: ${html.length}`);

    const parsed = parseDTEStatusFromHTML(html);
    if (parsed.found) {
      return {
        ok: true, method: "public-cgi",
        estado: parsed.code, glosa: parsed.glosa,
        errCode: parsed.errCode || "0", glosaErr: parsed.detail || "",
      };
    }

    if (html.includes("IngresoRutClave") || html.includes("CAutInicio")) {
      return { ok: false, error: "La verificación pública requiere autenticación" };
    }

    return { ok: false, error: "No se pudo obtener estado del DTE por vía pública" };

  } catch (err: any) {
    return { ok: false, error: `Error verificación pública: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════
// 5. DIAGNÓSTICOS
// ═══════════════════════════════════════════════

async function runDiagnostics(rut?: string, dv?: string, clave?: string) {
  const results: any = { timestamp: new Date().toISOString(), tests: [] };

  // Test 1: Conectividad
  try {
    const r = await fetch("https://www.sii.cl/", { headers: { "User-Agent": UA }, redirect: "follow" });
    results.tests.push({ name: "Conectividad www.sii.cl", ok: r.status < 400, status: r.status });
  } catch (e: any) {
    results.tests.push({ name: "Conectividad www.sii.cl", ok: false, error: e.message });
  }

  // Test 2: Página de login
  try {
    const r = await fetch("https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html", {
      headers: { "User-Agent": UA }, redirect: "follow",
    });
    results.tests.push({ name: "Login page (zeusr.sii.cl)", ok: r.status === 200, status: r.status });
  } catch (e: any) {
    results.tests.push({ name: "Login page", ok: false, error: e.message });
  }

  // Test 3: SOAP CrSeed
  try {
    const seedResp = await fetch("https://palena.sii.cl/DTEWS/CrSeed.jws", {
      method: "POST",
      headers: { "Content-Type": "text/xml;charset=UTF-8", "SOAPAction": '""', "User-Agent": UA },
      body: `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><getSeed xmlns="http://DefaultNamespace"/></soapenv:Body></soapenv:Envelope>`,
    });
    const seedXml = await seedResp.text();
    const seedMatch = seedXml.match(/SEMILLA[^>]*>(\d+)/);
    results.tests.push({
      name: "SOAP CrSeed (palena.sii.cl)", ok: !!seedMatch,
      seed: seedMatch ? seedMatch[1] : null, status: seedResp.status,
    });
  } catch (e: any) {
    results.tests.push({ name: "SOAP CrSeed", ok: false, error: e.message });
  }

  // Test 4: Auth
  if (rut && dv && clave) {
    const auth = await siiLogin(rut, dv, clave);
    results.tests.push({ name: "Autenticación SII", ...auth });
  }

  return jsonOk({ ok: true, diagnostics: results });
}

// ═══════════════════════════════════════════════
// 6. OBTENER DOCUMENTOS DEL SII (RCV / Emitidos / Recibidos)
// ═══════════════════════════════════════════════

async function fetchSIIDocuments(
  cookies: string,
  rutEmpresa: string,
  dvEmpresa: string,
  periodo: string
): Promise<any> {
  const attempts: any[] = [];
  const hdrs: Record<string, string> = {
    "User-Agent": UA,
    "Cookie": cookies,
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "es-CL,es;q=0.9",
  };

  console.log(`[FETCH] empresa=${rutEmpresa}-${dvEmpresa}, periodo=${periodo}`);

  // ════════════════════════════════════════
  // PHASE 1: Discover real API endpoints from SII SPA bundles
  // ════════════════════════════════════════
  let spaInfo: any = {};
  const discoveredPaths: string[] = [];

  // Load multiple SII apps in parallel to find API paths
  const spaApps = [
    { n: "rcv", u: "https://www4.sii.cl/consdcvinternetui/" },
    { n: "emitidos", u: "https://www4.sii.cl/consemitidosinternetui/" },
    { n: "recibidos", u: "https://www4.sii.cl/consrecibidosinternetui/" },
  ];

  try {
    const spaResults = await Promise.allSettled(
      spaApps.map(async (app) => {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 5000);
        const r = await fetch(app.u, { headers: hdrs, redirect: "follow", signal: c.signal });
        clearTimeout(t);
        const html = await r.text();
        const isAuth = !html.includes("IngresoRutClave") && !html.includes("CAutInicio");
        // Extract all JS bundle URLs
        const scripts = [...html.matchAll(/src=["']([^"']*\.js[^"']*)/gi)].map(m => m[1]);
        // Also find inline REST paths
        const inlinePaths: string[] = [];
        for (const m of html.matchAll(/["']((?:\/[\w-]+)*\/rest\/[\w/.-]+)["']/g)) {
          if (!inlinePaths.includes(m[1])) inlinePaths.push(m[1]);
        }
        return { name: app.n, isAuth, scripts, inlinePaths, htmlSize: html.length };
      })
    );

    const allScriptUrls: string[] = [];
    for (const sr of spaResults) {
      if (sr.status === "fulfilled") {
        const v = sr.value;
        spaInfo[v.name] = { auth: v.isAuth, scripts: v.scripts.length, htmlSize: v.htmlSize };
        if (v.isAuth) {
          for (const p of v.inlinePaths) {
            if (!discoveredPaths.includes(p)) discoveredPaths.push(p);
          }
          for (const s of v.scripts) {
            const jsUrl = s.startsWith("http") ? s :
              s.startsWith("/") ? `https://www4.sii.cl${s}` :
              `https://www4.sii.cl/${s}`;
            if (!allScriptUrls.includes(jsUrl)) allScriptUrls.push(jsUrl);
          }
        }
      }
    }

    // Fetch JS bundles in parallel (max 6) to extract REST API paths
    if (allScriptUrls.length > 0) {
      const jsResults = await Promise.allSettled(
        allScriptUrls.slice(0, 6).map(async (jsUrl) => {
          const c = new AbortController();
          const t = setTimeout(() => c.abort(), 5000);
          const r = await fetch(jsUrl, {
            headers: { "User-Agent": UA, "Cookie": cookies },
            signal: c.signal,
          });
          clearTimeout(t);
          const js = await r.text();
          const paths: string[] = [];
          // Find REST endpoints: "/rest/...", "/services/...", "/api/..."
          for (const m of js.matchAll(/["']((?:\/[\w-]+)*\/(?:rest|services|api)\/[\w/.:-]+)["']/g)) {
            const p = m[1];
            if (p.length > 5 && p.length < 120 && !p.includes("\\")) paths.push(p);
          }
          // Find URL patterns with template literals or concatenation
          for (const m of js.matchAll(/(?:url|endpoint|path|api|service)\s*[=:]\s*["'](\/[\w/.:-]+)["']/gi)) {
            const p = m[1];
            if (p.includes("rest") || p.includes("service")) paths.push(p);
          }
          return { url: jsUrl.split("/").pop(), paths };
        })
      );

      for (const jr of jsResults) {
        if (jr.status === "fulfilled") {
          for (const p of jr.value.paths) {
            if (!discoveredPaths.includes(p)) discoveredPaths.push(p);
          }
        }
      }
    }

    spaInfo.discoveredPaths = discoveredPaths;
    console.log(`[FETCH] Discovered ${discoveredPaths.length} API paths from SPA bundles`);
  } catch (e: any) {
    spaInfo.discoveryError = (e.message || "").substring(0, 100);
  }

  // ════════════════════════════════════════
  // PHASE 2: Build endpoint list (known + discovered)
  // ════════════════════════════════════════
  const rutFmt = formatRutDots(rutEmpresa, dvEmpresa); // "76.xxx.xxx-K"

  // Known endpoint patterns (various SII API versions)
  const knownEndpoints = [
    // RCV — Registro de Compras y Ventas
    `https://www4.sii.cl/consdcvinternetui/rest/rgDocCompras?rut_receptor=${rutEmpresa}&dv_receptor=${dvEmpresa}&ptributario=${periodo}&estadoContab=REGISTRO&codTipoDoc=ALL`,
    `https://www4.sii.cl/consdcvinternetui/rest/rgResumen?rut_receptor=${rutEmpresa}&dv_receptor=${dvEmpresa}&ptributario=${periodo}`,
    `https://www4.sii.cl/consdcvinternetui/rest/rgDocVentas?rut_emisor=${rutEmpresa}&dv_emisor=${dvEmpresa}&ptributario=${periodo}&estadoContab=REGISTRO&codTipoDoc=ALL`,
    // DCV services
    `https://www4.sii.cl/dcvinternetservices/rest/rgDocCompras?rut_receptor=${rutEmpresa}&dv_receptor=${dvEmpresa}&ptributario=${periodo}&estadoContab=REGISTRO&codTipoDoc=ALL`,
    `https://www4.sii.cl/dcvinternetservices/rest/rgResumen?rut_receptor=${rutEmpresa}&dv_receptor=${dvEmpresa}&ptributario=${periodo}`,
    `https://www4.sii.cl/dcvinternetservices/rest/rgDocVentas?rut_emisor=${rutEmpresa}&dv_emisor=${dvEmpresa}&ptributario=${periodo}&estadoContab=REGISTRO&codTipoDoc=ALL`,
    // Emitidos / Recibidos
    `https://www4.sii.cl/consemitidosinternetui/rest/services/dtes/emitidos?rut=${rutEmpresa}&dv=${dvEmpresa}&tipoDoc=ALL&periodo=${periodo}`,
    `https://www4.sii.cl/consrecibidosinternetui/rest/services/dtes/recibidos?rut=${rutEmpresa}&dv=${dvEmpresa}&tipoDoc=ALL&periodo=${periodo}`,
    // RCV con formato alternativo
    `https://www4.sii.cl/consdcvinternetui/rest/rgDocCompras?rutReceptor=${rutEmpresa}&dvReceptor=${dvEmpresa}&periodoTributario=${periodo}`,
    // Boletas
    `https://www4.sii.cl/bolaboracioninternetui/rest/services/boleta/emitida/${rutEmpresa}/${dvEmpresa}?periodo=${periodo}`,
    // IECV (Información Electrónica de Compras y Ventas)
    `https://www4.sii.cl/aboraboracioninternetui/rest/services/iecv/compras/${rutEmpresa}/${dvEmpresa}/${periodo}`,
    `https://www4.sii.cl/registrocompaboracioninternetui/rest/services/compras/${rutEmpresa}/${dvEmpresa}/${periodo}`,
  ];

  // Build discovered endpoint URLs with query params
  const discoveredEndpoints: string[] = [];
  for (const dp of discoveredPaths) {
    // Skip paths that already have full query params embedded or are too generic
    if (dp.includes("?") || dp.length < 6) continue;
    
    // Build full URL with params
    const base = dp.startsWith("http") ? dp : `https://www4.sii.cl${dp}`;
    
    // Try with query params
    discoveredEndpoints.push(`${base}?rut_receptor=${rutEmpresa}&dv_receptor=${dvEmpresa}&ptributario=${periodo}&estadoContab=REGISTRO&codTipoDoc=ALL`);
    discoveredEndpoints.push(`${base}?rut=${rutEmpresa}&dv=${dvEmpresa}&periodo=${periodo}`);
  }

  // Combine all unique endpoints
  const allEndpoints: { n: string; u: string }[] = [];
  const seenUrls = new Set<string>();
  
  for (const u of knownEndpoints) {
    if (!seenUrls.has(u)) { seenUrls.add(u); allEndpoints.push({ n: `known-${allEndpoints.length}`, u }); }
  }
  for (const u of discoveredEndpoints) {
    if (!seenUrls.has(u)) { seenUrls.add(u); allEndpoints.push({ n: `disc-${allEndpoints.length}`, u }); }
  }

  console.log(`[FETCH] Testing ${allEndpoints.length} endpoints (${knownEndpoints.length} known + ${discoveredEndpoints.length} discovered)`);

  // ════════════════════════════════════════
  // PHASE 3: Try all endpoints in parallel
  // ════════════════════════════════════════
  async function tryEndpoint(ep: { n: string; u: string }): Promise<{ name: string; docs?: any[]; info: any }> {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 5000);
      const resp = await fetch(ep.u, { headers: hdrs, redirect: "manual", signal: ctrl.signal });
      clearTimeout(tid);

      const status = resp.status;
      const ct = resp.headers.get("content-type") || "";
      const bodyText = await resp.text();
      
      // Clean URL for logging (remove long query strings)
      const shortUrl = ep.u.replace(/https:\/\/www4\.sii\.cl/, "").split("?")[0];
      const info: any = { name: ep.n, url: shortUrl, status, type: ct.split(";")[0], len: bodyText.length };

      if (status >= 300 && status < 400) {
        info.note = "redirect";
        info.location = (resp.headers.get("location") || "").substring(0, 120);
      } else if (status === 200) {
        const trimmed = bodyText.trimStart();
        const firstChar = trimmed.charAt(0);
        
        // Try JSON parsing
        if (ct.includes("json") || firstChar === "{" || firstChar === "[") {
          try {
            const data = JSON.parse(bodyText);
            const docs = extractDocArray(data);
            if (docs.length > 0) {
              return { name: ep.n, docs, info: { ...info, note: `found-${docs.length}-docs` } };
            }
            // Store the keys for debugging even if no docs
            const keys = typeof data === "object" && data !== null ? Object.keys(data).slice(0, 8) : [];
            info.note = `json:${keys.join(",")}`;
            info.sample = JSON.stringify(data).substring(0, 250);
          } catch (_) {
            info.note = "json-parse-fail";
            info.sample = bodyText.substring(0, 150);
          }
        }
        // Try HTML scraping
        else if (ct.includes("html")) {
          if (bodyText.includes("IngresoRutClave") || bodyText.includes("CAutInicio")) {
            info.note = "needs-login";
          } else if (bodyText.includes("<table")) {
            const docs = scrapeTable(bodyText);
            if (docs.length > 0) {
              return { name: ep.n + "-html", docs, info: { ...info, note: `scraped-${docs.length}-docs` } };
            }
            info.note = "html-table-empty";
          } else {
            info.note = "html-other";
            info.sample = bodyText.substring(0, 200);
          }
        } else {
          info.note = `other-content`;
          info.sample = bodyText.substring(0, 200);
        }
      } else {
        info.note = `http-${status}`;
      }

      return { name: ep.n, info };
    } catch (e: any) {
      const msg = (e.message || "").substring(0, 80);
      return { name: ep.n, info: { name: ep.n, error: msg.includes("abort") ? "timeout" : msg } };
    }
  }

  // Run in batches of 8 to avoid overwhelming
  let foundResult: any = null;
  for (let i = 0; i < allEndpoints.length && !foundResult; i += 8) {
    const batch = allEndpoints.slice(i, i + 8);
    const results = await Promise.allSettled(batch.map(ep => tryEndpoint(ep)));

    for (const r of results) {
      if (r.status === "fulfilled") {
        attempts.push(r.value.info);
        if (r.value.docs && r.value.docs.length > 0 && !foundResult) {
          foundResult = {
            ok: true,
            documents: r.value.docs,
            method: r.value.name,
            periodo,
            totalDocs: r.value.docs.length,
            attempts,
            spaInfo,
          };
        }
      } else {
        attempts.push({ name: "batch-error", error: (r.reason?.message || "").substring(0, 80) });
      }
    }
  }

  if (foundResult) {
    console.log(`[FETCH] ✅ Found docs via ${foundResult.method}`);
    return foundResult;
  }

  console.log(`[FETCH] ❌ No docs found after ${attempts.length} attempts`);
  return {
    ok: false,
    error: `No se pudieron obtener documentos del período ${periodo}. Se probaron ${attempts.length} endpoints del SII.`,
    periodo,
    attempts,
    spaInfo,
    hint: "Expanda 'Detalles técnicos' para ver qué respondió cada endpoint. Los que devolvieron JSON (json:...) están más cerca de funcionar.",
  };
}

function getCurrentPeriodo(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function extractDocArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  for (const k of [
    "data", "documentos", "items", "listaDocs", "listaDocumentos",
    "compras", "ventas", "boletas", "registros", "detalle", "lista",
  ]) {
    if (data[k] && Array.isArray(data[k])) return data[k];
  }
  if (data.folio || data.tipoDte || data.rut_emisor) return [data];
  for (const v of Object.values(data)) {
    if (Array.isArray(v) && (v as any[]).length > 0) return v as any[];
  }
  return [];
}

function scrapeTable(html: string): any[] {
  const docs: any[] = [];
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  let headers: string[] = [];
  for (const r of rows) {
    const row = r[1];
    if (row.includes("<th")) {
      headers = [...row.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) =>
        m[1].replace(/<[^>]+>/g, "").trim()
      );
      continue;
    }
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      m[1].replace(/<[^>]+>/g, "").trim()
    );
    if (cells.length < 3) continue;
    if (headers.length > 0) {
      const doc: any = {};
      headers.forEach((h, i) => {
        if (i < cells.length) doc[h.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")] = cells[i];
      });
      docs.push(doc);
    } else if (cells.length >= 4) {
      docs.push({ col0: cells[0], col1: cells[1], col2: cells[2], col3: cells[3], col4: cells[4] || "", col5: cells[5] || "" });
    }
  }
  return docs;
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

/** Formatea RUT con puntos y guión: "16941094","1" → "16.941.094-1" */
function formatRutDots(rut: string, dv: string): string {
  let formatted = "";
  const chars = rut.split("").reverse();
  for (let i = 0; i < chars.length; i++) {
    if (i > 0 && i % 3 === 0) formatted = "." + formatted;
    formatted = chars[i] + formatted;
  }
  return `${formatted}-${dv}`;
}

/** Recopila todas las cookies Set-Cookie de una respuesta HTTP */
function collectCookies(
  response: Response,
  allCookies: string[],
  onCookie?: (name: string, val: string) => void
) {
  // Método 1: getSetCookie (Deno) — correcto para múltiples Set-Cookie
  try {
    const setCookies = (response.headers as any).getSetCookie?.() || [];
    for (const c of setCookies) {
      const nameVal = c.split(";")[0];
      if (nameVal && !allCookies.includes(nameVal)) {
        allCookies.push(nameVal);
        const eqIdx = nameVal.indexOf("=");
        if (eqIdx > 0 && onCookie) {
          onCookie(nameVal.substring(0, eqIdx), nameVal.substring(eqIdx + 1));
        }
      }
    }
  } catch (_) {}

  // Método 2: entries() fallback (puede fallar con múltiples Set-Cookie)
  for (const [key, value] of response.headers.entries()) {
    if (key.toLowerCase() === "set-cookie") {
      // Puede venir comma-separated si entries() combina headers
      const parts = value.split(/,(?=[^;]*=)/);
      for (const part of parts) {
        const nameVal = part.trim().split(";")[0];
        if (nameVal && !allCookies.includes(nameVal)) {
          allCookies.push(nameVal);
          const eqIdx = nameVal.indexOf("=");
          if (eqIdx > 0 && onCookie) {
            onCookie(nameVal.substring(0, eqIdx), nameVal.substring(eqIdx + 1));
          }
        }
      }
    }
  }
}

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function mapEstado(code: string): string {
  const c = code.toUpperCase();
  if (c === "DOK" || c === "0") return "DOK";
  if (c === "DNK" || c === "2") return "DNK";
  if (c === "FAU" || c === "1") return "FAU";
  if (c === "FAN" || c === "3") return "FAN";
  if (c === "EMP" || c === "4") return "EMP";
  if (c === "ANC" || c === "5") return "ANC";
  if (c === "FNA" || c === "6") return "FNA";
  return c;
}

function parseDTEStatusFromHTML(html: string): { found: boolean; code?: string; glosa?: string; errCode?: string; detail?: string } {
  const lower = html.toLowerCase();

  if (lower.includes("datos coinciden") || lower.includes("documento válido") ||
      lower.includes("documento valido") || lower.includes("timbre electrónico verificado") ||
      lower.includes("timbre electronico verificado") || lower.includes("recibido por el sii") ||
      lower.includes("documento tributario electrónico recibido")) {
    return { found: true, code: "DOK", glosa: "DTE Recibido por el SII", errCode: "0", detail: "Documento recibido por el SII. Datos coinciden." };
  }
  if (lower.includes("datos no coinciden")) {
    return { found: true, code: "DNK", glosa: "Datos No Coinciden", errCode: "2", detail: "El DTE fue recibido pero los datos proporcionados no coinciden." };
  }
  if (lower.includes("no ha sido recibido") || lower.includes("documento no encontrado") ||
      lower.includes("no existe en los registros") || lower.includes("no ha sido enviado")) {
    return { found: true, code: "FAU", glosa: "No Recibido por el SII", errCode: "1", detail: "El documento no ha sido recibido por el SII." };
  }
  if (lower.includes("anulado")) {
    return { found: true, code: "FAN", glosa: "Documento Anulado", errCode: "3", detail: "El documento fue anulado en el SII." };
  }
  if (lower.includes("no autorizado") || lower.includes("no autorizada")) {
    return { found: true, code: "EMP", glosa: "Empresa No Autorizada", errCode: "4", detail: "La empresa no está autorizada para emitir este tipo de DTE." };
  }
  if (lower.includes("reclamo") || lower.includes("reclamado")) {
    return { found: true, code: "RCL", glosa: "DTE Reclamado", errCode: "5", detail: "El documento ha sido objeto de reclamo." };
  }

  return { found: false };
}
