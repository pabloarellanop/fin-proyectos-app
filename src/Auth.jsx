import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

/**
 * Auth.jsx
 * - Email + password (sign up / sign in)
 * - Magic link (sign in with email link)
 *
 * Nota: Puedes usar solo magic link si quieres (recomendado al inicio).
 */
export default function Auth() {
  const [mode, setMode] = useState("magic"); // "magic" | "password"
  const [variant, setVariant] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Donde volver después del login por email (Vercel o localhost)
  const redirectTo = useMemo(() => {
    // Vite expone import.meta.env.BASE_URL pero para redirect conviene usar origin
    return window.location.origin;
  }, []);

  useEffect(() => {
    setMsg("");
    setErr("");
  }, [mode, variant]);

  async function handleMagicLink(e) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    setErr("");

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
        },
      });
      if (error) throw error;

      setMsg(
        "Te enviamos un link al correo. Ábrelo para iniciar sesión y volver a la app."
      );
    } catch (ex) {
      setErr(ex?.message || "Error al enviar el link.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePassword(e) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    setErr("");

    try {
      if (variant === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        setMsg(
          "Cuenta creada. Revisa tu correo para confirmar (si está activado) y luego inicia sesión."
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        setMsg("Sesión iniciada.");
      }
    } catch (ex) {
      setErr(ex?.message || "Error en autenticación.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "40px auto",
        padding: 16,
        borderRadius: 16,
        border: "1px solid rgba(0,0,0,0.12)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Iniciar sesión</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setMode("magic")}
            style={{
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.12)",
              background: mode === "magic" ? "rgba(0,0,0,0.06)" : "white",
              cursor: "pointer",
            }}
          >
            Link
          </button>
          <button
            type="button"
            onClick={() => setMode("password")}
            style={{
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.12)",
              background: mode === "password" ? "rgba(0,0,0,0.06)" : "white",
              cursor: "pointer",
            }}
          >
            Password
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={{ fontSize: 12, opacity: 0.75 }}>Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
          type="email"
          style={{
            width: "100%",
            padding: 10,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.18)",
            marginTop: 6,
          }}
        />
      </div>

      {mode === "password" && (
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 12, opacity: 0.75 }}>Password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="********"
            type="password"
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.18)",
              marginTop: 6,
            }}
          />

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={() => setVariant("signin")}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.12)",
                background: variant === "signin" ? "rgba(0,0,0,0.06)" : "white",
                cursor: "pointer",
              }}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setVariant("signup")}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.12)",
                background: variant === "signup" ? "rgba(0,0,0,0.06)" : "white",
                cursor: "pointer",
              }}
            >
              Crear cuenta
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {mode === "magic" ? (
          <button
            onClick={handleMagicLink}
            disabled={loading || !email}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "black",
              color: "white",
              cursor: "pointer",
              opacity: loading || !email ? 0.6 : 1,
            }}
          >
            {loading ? "Enviando..." : "Enviar link a mi correo"}
          </button>
        ) : (
          <button
            onClick={handlePassword}
            disabled={loading || !email || !password}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "black",
              color: "white",
              cursor: "pointer",
              opacity: loading || !email || !password ? 0.6 : 1,
            }}
          >
            {loading
              ? "Procesando..."
              : variant === "signup"
              ? "Crear cuenta"
              : "Iniciar sesión"}
          </button>
        )}
      </div>

      {msg && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 12,
            background: "rgba(22,163,74,0.10)",
            border: "1px solid rgba(22,163,74,0.25)",
            fontSize: 13,
          }}
        >
          {msg}
        </div>
      )}

      {err && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 12,
            background: "rgba(220,38,38,0.10)",
            border: "1px solid rgba(220,38,38,0.25)",
            fontSize: 13,
          }}
        >
          {err}
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 12, opacity: 0.7 }}>
        Recomendación: usa “Link” (magic link) al inicio. Es más simple.
      </div>
    </div>
  );
}
