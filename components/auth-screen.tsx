"use client";

/* ============================================================
   Sign in / sign up.

   Same screen as the Firebase build, same copy, same markup —
   what changed is behind it: a POST to our own auth routes, and a
   session cookie instead of a Firebase token.
   ============================================================ */

import { useState } from "react";
import { api } from "@/lib/client";
import { Icon } from "./icons";

type Mode = "signin" | "signup";

export default function AuthScreen({ firstRun }: { firstRun: boolean }) {
  const [mode, setMode] = useState<Mode>(firstRun ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const signup = mode === "signup";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setError("");
    setBusy(true);
    try {
      await api(signup ? "/api/auth/signup" : "/api/auth/login", {
        body: signup ? { name, email, password } : { email, password },
      });
      // A full navigation, so the server layout re-reads the cookie and
      // renders the shell for the account that just signed in.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark" aria-hidden="true">
            <Icon name="menu" />
          </div>
          <div className="brand-text">
            <span className="brand-name">Crafty</span>
            <span className="brand-sub">Central</span>
          </div>
        </div>

        <h1 className="auth-title">{signup ? "Create your account" : "Sign in"}</h1>
        <p className="auth-sub">
          {firstRun
            ? "Nobody has signed up yet — the first account becomes the owner."
            : signup
              ? "Use the email your admin has on file so your role and schedule connect automatically."
              : "Log in with your Crafty account."}
        </p>

        <form onSubmit={onSubmit}>
          {signup && (
            <div className="field">
              <label htmlFor="authName">Your name</label>
              <input
                type="text"
                id="authName"
                autoComplete="name"
                placeholder="First and last name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="authEmail">Email</label>
            <input
              type="email"
              id="authEmail"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="authPass">Password</label>
            <input
              type="password"
              id="authPass"
              required
              minLength={signup ? 8 : 1}
              autoComplete={signup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <div className="auth-err">{error}</div>}

          <button
            className="btn primary"
            type="submit"
            disabled={busy}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {busy ? "One moment…" : signup ? "Create account" : "Sign in"}
          </button>
        </form>

        <button
          className="text-btn"
          type="button"
          onClick={() => {
            setMode(signup ? "signin" : "signup");
            setError("");
          }}
        >
          {signup ? "Already have an account? Sign in" : "First time here? Create your account"}
        </button>
      </div>
    </div>
  );
}
