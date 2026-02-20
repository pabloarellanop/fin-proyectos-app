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

  // Pre-step: visit Mi SII to activate session across subdomains
  try {
    await fetch("https://misiir.sii.cl/cgi_misii/siihome.cgi", {
      headers: { "User-Agent": UA, "Cookie": cookies },
      redirect: "follow",
    });
  } catch (_) {}

  // ── All endpoint patterns (most likely first) ──
  const endpoints = [
    // RCV Compras (purchases received)
    { n: "rcv-compras-1", u: `https://www4.sii.cl/consdcvinternetui/rest/rgDocCompras?rut_receptor=${rutEmpresa}&dv_receptor=${dvEmpresa}&ptributario=${periodo}&estadoContab=REGISTRO&codTipoDoc=ALL` },
    { n: "rcv-resumen", u: `https://www4.sii.cl/consdcvinternetui/rest/rgResumen?rut_receptor=${rutEmpresa}&dv_receptor=${dvEmpresa}&ptributario=${periodo}` },
    { n: "rcv-buscar", u: `https://www4.sii.cl/consdcvinternetui/rest/rgBuscarDocCompras?rut_receptor=${rutEmpresa}&dv_receptor=${dvEmpresa}&ptributario=${periodo}&codTipoDoc=ALL&estadoContab=REGISTRO` },
    { n: "rcv-compras-2", u: `https://www4.sii.cl/consdcvinternetui/rest/rgDocCompras?rutReceptor=${rutEmpresa}&dvReceptor=${dvEmpresa}&periodoTributario=${periodo}&estadoContab=REGISTRO&codTipoDoc=ALL` },
    // RCV Ventas (sales emitted)
    { n: "rcv-ventas", u: `https://www4.sii.cl/consdcvinternetui/rest/rgDocVentas?rut_emisor=${rutEmpresa}&dv_emisor=${dvEmpresa}&ptributario=${periodo}&estadoContab=REGISTRO&codTipoDoc=ALL` },
    // Path-based patterns
    { n: "rcv-path", u: `https://www4.sii.cl/consdcvinternetui/rest/compras/${rutEmpresa}-${dvEmpresa}/${periodo}` },
    { n: "rcv-dcv", u: `https://www4.sii.cl/consdcvinternetui/rest/dcv/${rutEmpresa}/${dvEmpresa}/${periodo}` },
    // DTE Emitidos / Recibidos
    { n: "emitidos", u: `https://www4.sii.cl/consemitidosinternetui/rest/services/dtes/emitidos?rut=${rutEmpresa}&dv=${dvEmpresa}&tipoDoc=ALL&periodo=${periodo}` },
    { n: "recibidos", u: `https://www4.sii.cl/consemitidosinternetui/rest/services/dtes/recibidos?rut=${rutEmpresa}&dv=${dvEmpresa}&tipoDoc=ALL&periodo=${periodo}` },
    // Boletas
    { n: "boletas-e", u: `https://www4.sii.cl/bolaboracioninternetui/rest/services/boleta/emitida/${rutEmpresa}/${dvEmpresa}?periodo=${periodo}` },
    { n: "boletas-r", u: `https://www4.sii.cl/bolaboracioninternetui/rest/services/boleta/recibida/${rutEmpresa}/${dvEmpresa}?periodo=${periodo}` },
    // CGI endpoints
    { n: "dte-auth-7", u: "https://palena.sii.cl/cgi_dte/UPL/DTEauth?7" },
    { n: "dte-auth-6", u: "https://palena.sii.cl/cgi_dte/UPL/DTEauth?6" },
  ];

  for (const ep of endpoints) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8000);
      const resp = await fetch(ep.u, { headers: hdrs, redirect: "manual", signal: ctrl.signal });
      clearTimeout(tid);

      const status = resp.status;
      const ct = resp.headers.get("content-type") || "";
      const body = await resp.text();
      const a: any = { name: ep.n, status, type: ct.split(";")[0], len: body.length };

      if (status >= 300 && status < 400) {
        a.note = "redirect";
        a.location = (resp.headers.get("location") || "").substring(0, 100);
      } else if (status === 200) {
        // Try JSON
        const firstChar = body.trimStart().charAt(0);
        if (ct.includes("json") || firstChar === "{" || firstChar === "[") {
          try {
            const data = JSON.parse(body);
            const docs = extractDocArray(data);
            if (docs.length > 0) {
              console.log(`[FETCH] ✅ ${ep.n}: ${docs.length} docs`);
              return { ok: true, documents: docs, method: ep.n, periodo, totalDocs: docs.length, attempts };
            }
            a.note = `json-keys:${Object.keys(data).slice(0, 5).join(",")}`;
          } catch (_) {
            a.note = "json-parse-fail";
          }
        }
        // Try HTML scraping
        if (ct.includes("html")) {
          if (body.includes("IngresoRutClave") || body.includes("CAutInicio")) {
            a.note = "login-redirect";
          } else if (body.includes("<table")) {
            const docs = scrapeTable(body);
            if (docs.length > 0) {
              console.log(`[FETCH] ✅ ${ep.n} scraped ${docs.length} docs`);
              return { ok: true, documents: docs, method: ep.n + "-html", periodo, totalDocs: docs.length, attempts };
            }
            a.note = "html-table-no-data";
          } else {
            a.note = "html-no-table";
          }
          a.snippet = body.substring(0, 200);
        }
      } else {
        a.note = `http-${status}`;
      }

      attempts.push(a);
      console.log(`[FETCH] ${ep.n}: ${status} ${a.note || ""}`);
    } catch (e: any) {
      attempts.push({ name: ep.n, error: (e.message || "").substring(0, 80) });
    }
  }

  // ── SPA discovery: load the RCV Angular app, find JS bundles, extract API paths ──
  let spaInfo: any = {};
  try {
    const spaResp = await fetch("https://www4.sii.cl/consdcvinternetui/", {
      headers: hdrs,
      redirect: "follow",
    });
    const html = await spaResp.text();

    if (!html.includes("IngresoRutClave") && !html.includes("CAutInicio")) {
      spaInfo.loaded = true;
      spaInfo.size = html.length;

      // Find JS bundle URLs
      const scripts = [...html.matchAll(/src=["']([^"']*\.js[^"']*)/gi)].map((m) => m[1]);
      spaInfo.scripts = scripts.length;

      const apiPaths: string[] = [];
      for (const s of scripts.slice(0, 4)) {
        const jsUrl = s.startsWith("http")
          ? s
          : `https://www4.sii.cl${s.startsWith("/") ? "" : "/consdcvinternetui/"}${s}`;
        try {
          const jr = await fetch(jsUrl, { headers: { "User-Agent": UA, "Cookie": cookies } });
          const js = await jr.text();
          for (const m of js.matchAll(/["']((?:\/\w+)?\/rest\/[\w/]+)["']/g)) {
            if (!apiPaths.includes(m[1])) apiPaths.push(m[1]);
          }
        } catch (_) {}
      }
      spaInfo.apiPaths = apiPaths;

      // Try discovered API paths
      for (const p of apiPaths) {
        const url = `https://www4.sii.cl${p}?rut_receptor=${rutEmpresa}&dv_receptor=${dvEmpresa}&ptributario=${periodo}&estadoContab=REGISTRO&codTipoDoc=ALL`;
        try {
          const r = await fetch(url, { headers: hdrs, redirect: "manual" });
          if (r.status === 200) {
            const b = await r.text();
            try {
              const d = JSON.parse(b);
              const docs = extractDocArray(d);
              if (docs.length > 0) {
                return { ok: true, documents: docs, method: `spa:${p}`, periodo, totalDocs: docs.length, spaInfo, attempts };
              }
            } catch (_) {}
          }
          attempts.push({ name: `spa:${p}`, status: r.status });
        } catch (_) {}
      }
    } else {
      spaInfo.loaded = false;
      spaInfo.note = "session-invalid-for-spa";
    }
  } catch (e: any) {
    spaInfo.error = (e.message || "").substring(0, 80);
  }

  console.log(`[FETCH] ❌ No docs found after ${attempts.length} attempts`);
  return {
    ok: false,
    error: `No se pudieron obtener documentos del período ${periodo}. Se probaron ${attempts.length} endpoints del SII.`,
    periodo,
    attempts,
    spaInfo,
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
