<<<<<<< HEAD
import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function Auth({ onAuthed }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) onAuthed(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) onAuthed(session);
    });

    return () => sub.subscription.unsubscribe();
  }, [onAuthed]);

  async function submit(e) {
    e.preventDefault();
    setErr("");

    const { error } =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

    if (error) setErr(error.message);
  }

  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 420, margin: "40px auto" }}>
        <h2 style={{ marginTop: 0 }}>
          {mode === "signup" ? "Crear cuenta" : "Ingresar"}
        </h2>

        <form onSubmit={submit} className="col" style={{ gap: 10 }}>
          <label>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />

          <label>Contraseña</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />

          {err && <div style={{ color: "#dc2626" }}>{err}</div>}

          <button className="primary" type="submit">
            {mode === "signup" ? "Crear cuenta" : "Entrar"}
          </button>

          <button
            type="button"
            className="ghost"
            onClick={() => setMode(mode === "signup" ? "login" : "signup")}
          >
            {mode === "signup" ? "Ya tengo cuenta" : "Crear cuenta"}
          </button>
        </form>
      </div>
=======
import React, { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Auth() {
  const [mode, setMode] = useState("magic"); // "magic" | "password"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMagicLink(e) {
    e.preventDefault();
    setStatus("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // After clicking the email link, come back to this app
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      setStatus("Listo. Revisa tu correo y abre el link para iniciar sesión.");
    } catch (err) {
      setStatus(err?.message ?? "Error enviando link.");
    } finally {
      setLoading(false);
    }
  }

  async function signInPassword(e) {
    e.preventDefault();
    setStatus("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setStatus("Sesión iniciada.");
    } catch (err) {
      setStatus(err?.message ?? "Error de inicio de sesión.");
    } finally {
      setLoading(false);
    }
  }

  async function signUpPassword(e) {
    e.preventDefault();
    setStatus("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setStatus("Cuenta creada. Revisa tu correo para confirmar (si aplica) e inicia sesión.");
    } catch (err) {
      setStatus(err?.message ?? "Error creando cuenta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 520, margin: "40px auto" }}>
      <h2 style={{ marginTop: 0 }}>Iniciar sesión</h2>
      <p className="small" style={{ marginTop: 0 }}>
        Accede para sincronizar la información entre dispositivos.
      </p>

      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button
          className={mode === "magic" ? "primary" : "ghost"}
          onClick={() => setMode("magic")}
          type="button"
        >
          Link al correo
        </button>
        <button
          className={mode === "password" ? "primary" : "ghost"}
          onClick={() => setMode("password")}
          type="button"
        >
          Contraseña
        </button>
      </div>

      <form onSubmit={mode === "magic" ? sendMagicLink : signInPassword}>
        <label className="small">Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="tu@correo.com"
          required
        />

        {mode === "password" && (
          <>
            <label className="small">Contraseña</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="••••••••"
              required
            />
          </>
        )}

        <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
          <button className="primary" disabled={loading} type="submit">
            {loading ? "Procesando…" : mode === "magic" ? "Enviar link" : "Iniciar sesión"}
          </button>

          {mode === "password" && (
            <button className="ghost" disabled={loading} type="button" onClick={signUpPassword}>
              Crear cuenta
            </button>
          )}
        </div>

        {status && (
          <div className="small" style={{ marginTop: 12, opacity: 0.8 }}>
            {status}
          </div>
        )}
      </form>
>>>>>>> d4244fd (Add Supabase auth gate + cloud state sync)
    </div>
  );
}
