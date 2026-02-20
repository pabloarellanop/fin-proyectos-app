import React, { useState, useRef, useCallback } from "react";
import { Modal } from "./shared";
import { parseMoney, nowISO } from "../utils";

/**
 * OCR Scanner component using Tesseract.js (loaded on-demand from CDN).
 * Extracts amount, date, and vendor from receipt/invoice photos.
 */
export default function OCRScanner({ open, onClose, onResult }) {
  const [status, setStatus] = useState("idle"); // idle | loading | processing | done | error
  const [preview, setPreview] = useState(null);
  const [extracted, setExtracted] = useState(null);
  const [rawText, setRawText] = useState("");
  const [progress, setProgress] = useState(0);
  const fileRef = useRef(null);
  const workerRef = useRef(null);

  const resetState = useCallback(() => {
    setStatus("idle");
    setPreview(null);
    setExtracted(null);
    setRawText("");
    setProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  function handleClose() {
    resetState();
    onClose();
  }

  async function loadTesseract() {
    if (window.Tesseract) return window.Tesseract;
    setStatus("loading");
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src*="tesseract"]')) {
        const check = setInterval(() => {
          if (window.Tesseract) { clearInterval(check); resolve(window.Tesseract); }
        }, 200);
        setTimeout(() => { clearInterval(check); reject(new Error("Timeout loading Tesseract")); }, 15000);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      script.onload = () => {
        const check = setInterval(() => {
          if (window.Tesseract) { clearInterval(check); resolve(window.Tesseract); }
        }, 100);
        setTimeout(() => { clearInterval(check); reject(new Error("Timeout")); }, 10000);
      };
      script.onerror = () => reject(new Error("Failed to load Tesseract.js"));
      document.head.appendChild(script);
    });
  }

  async function loadPdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[data-pdfjs]')) {
        const check = setInterval(() => {
          if (window.pdfjsLib) { clearInterval(check); resolve(window.pdfjsLib); }
        }, 200);
        setTimeout(() => { clearInterval(check); reject(new Error("Timeout loading pdf.js")); }, 15000);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
      script.setAttribute("data-pdfjs", "1");
      script.onload = () => {
        const check = setInterval(() => {
          if (window.pdfjsLib) {
            clearInterval(check);
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
              "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
            resolve(window.pdfjsLib);
          }
        }, 100);
        setTimeout(() => { clearInterval(check); reject(new Error("Timeout")); }, 10000);
      };
      script.onerror = () => reject(new Error("Failed to load pdf.js"));
      document.head.appendChild(script);
    });
  }

  function extractData(text) {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    // Extract amounts (Chilean format: $123.456 or 123456)
    const amountPatterns = [
      /\$\s*([\d.]+)/g,
      /(?:total|monto|valor|neto|bruto)\s*[:=]?\s*\$?\s*([\d.]+)/gi,
      /(?:^|\s)([\d]{1,3}(?:\.[\d]{3})+)(?:\s|$)/g,
    ];
    const amounts = [];
    for (const pattern of amountPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const val = parseMoney(match[1]);
        if (val >= 100 && val <= 999999999) amounts.push(val);
      }
    }
    // Pick the largest amount (usually total)
    const bestAmount = amounts.length > 0 ? Math.max(...amounts) : 0;

    // Extract date
    const datePatterns = [
      /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/,
      /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/,
    ];
    let bestDate = nowISO();
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        let [, a, b, c] = match;
        if (a.length === 4) {
          // YYYY-MM-DD
          bestDate = `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`;
        } else {
          // DD/MM/YYYY
          if (c.length === 2) c = "20" + c;
          bestDate = `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
        }
        break;
      }
    }

    // Extract vendor (first non-numeric line, or line with uppercase)
    let vendor = "";
    for (const line of lines.slice(0, 5)) {
      const cleaned = line.replace(/[^a-záéíóúñA-ZÁÉÍÓÚÑ\s.,-]/g, "").trim();
      if (cleaned.length >= 3 && !/^\d+$/.test(cleaned) && !/^(fecha|total|monto|rut|boleta|factura)/i.test(cleaned)) {
        vendor = cleaned;
        break;
      }
    }

    // Extract RUT
    const rutMatch = text.match(/\b(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])\b/);
    const rut = rutMatch ? rutMatch[1] : "";

    // Detect document type
    let documentType = "sin_respaldo";
    const lower = text.toLowerCase();
    if (lower.includes("factura") && (lower.includes("afecta") || lower.includes("iva"))) documentType = "factura_afecta";
    else if (lower.includes("factura") && lower.includes("exenta")) documentType = "factura_exenta";
    else if (lower.includes("boleta de honorarios") || lower.includes("honorarios")) documentType = "boleta_honorarios";
    else if (lower.includes("boleta")) documentType = "boleta";
    else if (lower.includes("nota de cr") || lower.includes("nota credito")) documentType = "nota_credito";

    // Extract doc number
    const docMatch = text.match(/(?:n[°ºo]|folio|boleta|factura)\s*[:.]?\s*(\d{1,10})/i);
    const documentNumber = docMatch ? docMatch[1] : "";

    return {
      amount: bestAmount,
      date: bestDate,
      vendor,
      rut,
      documentType,
      documentNumber,
    };
  }

  async function processFile(file) {
    if (file.type === "application/pdf" || file.name?.toLowerCase().endsWith(".pdf")) {
      await processPdf(file);
    } else {
      await processImage(file);
    }
  }

  async function processPdf(file) {
    try {
      const [Tesseract, pdfjsLib] = await Promise.all([loadTesseract(), loadPdfJs()]);
      if (!pdfjsLib) throw new Error("pdf.js not available");

      setStatus("processing");
      setProgress(0);

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = Math.min(pdf.numPages, 5); // limit to 5 pages

      let allText = "";

      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Use first page as preview
        if (i === 1) setPreview(canvas.toDataURL("image/png"));

        const result = await Tesseract.recognize(canvas, "spa", {
          logger: (m) => {
            if (m.status === "recognizing text") {
              const pageProgress = ((i - 1) + (m.progress || 0)) / totalPages;
              setProgress(Math.round(pageProgress * 100));
            }
          },
        });
        allText += (result.data.text || "") + "\n";
      }

      setRawText(allText);
      const data = extractData(allText);
      setExtracted(data);
      setStatus("done");
    } catch (err) {
      console.error("PDF OCR error:", err);
      setStatus("error");
    }
  }

  async function processImage(file) {
    try {
      const Tesseract = await loadTesseract();
      setStatus("processing");
      setProgress(0);

      const result = await Tesseract.recognize(file, "spa", {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setProgress(Math.round((m.progress || 0) * 100));
          }
        },
      });

      const text = result.data.text || "";
      setRawText(text);
      const data = extractData(text);
      setExtracted(data);
      setStatus("done");
    } catch (err) {
      console.error("OCR error:", err);
      setStatus("error");
    }
  }

  function handleFileSelect(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;

    // Preview (only for images; PDF preview is set during processing)
    if (!file.type.startsWith("application/pdf") && !file.name?.toLowerCase().endsWith(".pdf")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    }

    processFile(file);
  }

  function handleConfirm() {
    if (extracted) {
      onResult(extracted);
      handleClose();
    }
  }

  if (!open) return null;

  return (
    <Modal open={open} title="📷 Escanear boleta / factura" onClose={handleClose}>
      <div className="muted" style={{ marginBottom: 10 }}>
        Sube una imagen o PDF de una boleta o factura. Se extraerán automáticamente el monto, fecha, proveedor y tipo de documento.
      </div>

      {status === "idle" && (
        <div>
          <div className="formGrid" style={{ marginBottom: 10 }}>
            <label>Imagen o PDF de boleta / factura
              <input type="file" accept="image/*,application/pdf,.pdf" capture="environment" ref={fileRef} onChange={handleFileSelect} />
            </label>
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            Formatos: JPG, PNG, WebP, PDF. La primera carga puede demorar unos segundos descargando el motor OCR.
          </div>
        </div>
      )}

      {status === "loading" && (
        <div className="ocrStatusBox">
          <div className="ocrStatusIcon">⏳</div>
          <div>Cargando motor OCR…</div>
          <div className="muted">Primera vez puede tomar ~10 segundos</div>
        </div>
      )}

      {status === "processing" && (
        <div className="ocrStatusBox">
          <div className="ocrStatusIcon">🔍</div>
          <div>Procesando imagen… {progress}%</div>
          <div className="progressBar" style={{ marginTop: 8 }}>
            <div className="progressFill" style={{ width: `${progress}%`, background: "#3b82f6" }} />
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="ocrStatusBox" style={{ borderColor: "#fecaca", background: "#fef2f2" }}>
          <div className="ocrStatusIcon">❌</div>
          <div>Error al procesar la imagen</div>
          <button className="primary" style={{ marginTop: 8 }} onClick={resetState}>Intentar de nuevo</button>
        </div>
      )}

      {status === "done" && extracted && (
        <div>
          {preview && (
            <div style={{ marginBottom: 12, textAlign: "center" }}>
              <img src={preview} alt="Preview" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 10, border: "1px solid #e5e7eb" }} />
            </div>
          )}

          <div className="h2">Datos extraídos</div>
          <div className="formGrid" style={{ marginBottom: 12 }}>
            <label>Monto detectado
              <input
                value={extracted.amount || ""}
                onChange={(e) => setExtracted(prev => ({ ...prev, amount: parseMoney(e.target.value) }))}
                style={{ fontWeight: 700, fontSize: 16 }}
              />
            </label>
            <label>Fecha
              <input
                type="date"
                value={extracted.date || ""}
                onChange={(e) => setExtracted(prev => ({ ...prev, date: e.target.value }))}
              />
            </label>
            <label>Proveedor
              <input
                value={extracted.vendor || ""}
                onChange={(e) => setExtracted(prev => ({ ...prev, vendor: e.target.value }))}
              />
            </label>
            <label>RUT
              <input
                value={extracted.rut || ""}
                onChange={(e) => setExtracted(prev => ({ ...prev, rut: e.target.value }))}
              />
            </label>
            <label>Tipo documento
              <select
                value={extracted.documentType}
                onChange={(e) => setExtracted(prev => ({ ...prev, documentType: e.target.value }))}
              >
                <option value="sin_respaldo">Sin respaldo</option>
                <option value="boleta">Boleta</option>
                <option value="boleta_honorarios">Boleta de honorarios</option>
                <option value="factura_afecta">Factura afecta IVA</option>
                <option value="factura_exenta">Factura exenta</option>
                <option value="nota_credito">Nota de crédito</option>
              </select>
            </label>
            <label>N° documento
              <input
                value={extracted.documentNumber || ""}
                onChange={(e) => setExtracted(prev => ({ ...prev, documentNumber: e.target.value }))}
              />
            </label>
          </div>

          {rawText && (
            <details style={{ marginBottom: 12 }}>
              <summary className="small" style={{ cursor: "pointer" }}>Ver texto extraído (raw)</summary>
              <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", background: "#f8fafc", padding: 8, borderRadius: 8, maxHeight: 150, overflowY: "auto", marginTop: 4 }}>
                {rawText}
              </pre>
            </details>
          )}

          <div className="row" style={{ justifyContent: "space-between" }}>
            <button onClick={resetState}>Escanear otra</button>
            <button className="primary" onClick={handleConfirm}>✓ Usar estos datos</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
