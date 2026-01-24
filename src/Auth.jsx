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
    </div>
  );
}
