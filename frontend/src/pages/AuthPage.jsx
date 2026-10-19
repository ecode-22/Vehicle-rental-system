import { useState } from "react";
import { api } from "../services/api.js";

export default function AuthPage({ mode, go, onAuth }) {
  const isReg = mode === "register";
  const [form, setForm] = useState({ username: "", email: "", password: "", phone: "", role: "customer" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = key => event => setForm(current => ({ ...current, [key]: event.target.value }));

  const submit = async event => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isReg) await api("/auth/register/", { method: "POST", auth: false, body: form });
      const result = await api("/auth/login/", { method: "POST", auth: false, body: { username: form.username, password: form.password } });
      onAuth(result);
    } catch (reason) { setError(reason.message); }
    setBusy(false);
  };

  return (
    <form className="card auth" onSubmit={submit}>
      <h2>{isReg ? "Create your account" : "Welcome back"}</h2>
      {isReg && <>
        <label>I want to…</label>
        <div className="seg">
          <button type="button" className={form.role === "customer" ? "on" : ""} onClick={() => setForm(current => ({ ...current, role: "customer" }))}>Rent cars</button>
          <button type="button" className={form.role === "renter" ? "on" : ""} onClick={() => setForm(current => ({ ...current, role: "renter" }))}>List my cars</button>
        </div>
      </>}
      <label>Username</label><input required value={form.username} onChange={update("username")} />
      {isReg && <><label>Email</label><input type="email" value={form.email} onChange={update("email")} /><label>Phone</label><input value={form.phone} onChange={update("phone")} /></>}
      <label>Password</label><input type="password" required minLength={isReg ? 8 : 1} value={form.password} onChange={update("password")} />
      {error && <div className="err">{error}</div>}
      <button className="btn" style={{ width: "100%", marginTop: 16 }} disabled={busy}>{busy ? "Please wait…" : isReg ? "Sign up" : "Log in"}</button>
      <p className="sub" style={{ textAlign: "center", margin: "14px 0 0" }}>
        {isReg ? "Already have an account? " : "New here? "}
        <button type="button" className="link auth-switch" onClick={() => go(isReg ? "login" : "register")}>{isReg ? "Log in" : "Sign up"}</button>
      </p>
    </form>
  );
}