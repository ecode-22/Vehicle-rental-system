import { useState, useEffect, useCallback, useContext, createContext } from "react";

/* ================= CONFIG & API ================= */
const CURRENCY = "R";
const getApi = () => localStorage.getItem("apiBase") || import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

function errText(d) {
  if (!d) return "Request failed";
  if (typeof d === "string") return d;
  if (d.detail) return d.detail;
  return Object.entries(d).map(([k, v]) => {
    const msg = [].concat(v).map(x => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
    return k === "non_field_errors" ? msg : `${k}: ${msg}`;
  }).join(" • ");
}

function clearSession() {
  ["access", "refresh", "user"].forEach(k => localStorage.removeItem(k));
  window.dispatchEvent(new Event("session-ended"));
}

async function api(path, { method = "GET", body, auth = true } = {}) {
  const run = () => {
    const headers = { "Content-Type": "application/json" };
    const t = localStorage.getItem("access");
    if (auth && t) headers.Authorization = "Bearer " + t;
    return fetch(getApi() + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  };
  let res;
  try {
    res = await run();
    if (res.status === 401 && auth && localStorage.getItem("refresh")) {
      const r = await fetch(getApi() + "/auth/refresh/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: localStorage.getItem("refresh") })
      });
      if (r.ok) {
        localStorage.setItem("access", (await r.json()).access);
        res = await run();
      } else {
        clearSession();
        res = await fetch(getApi() + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      }
    }
  } catch (e) {
    throw new Error(`Can't reach the server at ${getApi()}. Is Django running?`);
  }
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(errText(data));
  return data;
}

const money = n => CURRENCY + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const todayStr = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/* ================= SHARED UI ================= */
const ToastCtx = createContext(() => {});
const useToast = () => useContext(ToastCtx);

function Modal({ title, onClose, children }) {
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="row" style={{ marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="link" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const Badge = ({ s }) => <span className={"badge " + s}>{s}</span>;

/* ================= AUTH ================= */
function AuthPage({ mode, go, onAuth }) {
  const isReg = mode === "register";
  const [f, setF] = useState({ username: "", email: "", password: "", phone: "", role: "customer" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });

  const submit = async e => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      if (isReg) await api("/auth/register/", { method: "POST", auth: false, body: f });
      const d = await api("/auth/login/", { method: "POST", auth: false, body: { username: f.username, password: f.password } });
      onAuth(d);
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  return (
    <form className="card auth" onSubmit={submit}>
      <h2>{isReg ? "Create your account" : "Welcome back"}</h2>
      {isReg && (
        <>
          <label>I want to…</label>
          <div className="seg">
            <button type="button" className={f.role === "customer" ? "on" : ""} onClick={() => setF({ ...f, role: "customer" })}>🚗 Rent cars</button>
            <button type="button" className={f.role === "renter" ? "on" : ""} onClick={() => setF({ ...f, role: "renter" })}>🏢 List my cars</button>
          </div>
        </>
      )}
      <label>Username</label><input required value={f.username} onChange={set("username")} />
      {isReg && <><label>Email</label><input type="email" value={f.email} onChange={set("email")} />
        <label>Phone</label><input value={f.phone} onChange={set("phone")} /></>}
      <label>Password</label><input type="password" required minLength={isReg ? 8 : 1} value={f.password} onChange={set("password")} />
      {err && <div className="err">{err}</div>}
      <button className="btn" style={{ width: "100%", marginTop: 16 }} disabled={busy}>{busy ? "Please wait…" : isReg ? "Sign up" : "Log in"}</button>
      <p className="sub" style={{ textAlign: "center", margin: "14px 0 0" }}>
        {isReg ? "Already have an account? " : "New here? "}
        <a href={isReg ? "#login" : "#register"} style={{ color: "var(--brand)" }}>{isReg ? "Log in" : "Sign up"}</a>
      </p>
    </form>
  );
}

/* ================= BROWSE CARS (user side) ================= */
function BookModal({ car, onClose, onDone }) {
  const [s, setS] = useState(todayStr());
  const [e, setE] = useState(todayStr());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const days = Math.max(0, Math.round((new Date(e) - new Date(s)) / 864e5) + 1);

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      await api("/bookings/", { method: "POST", body: { car: car.id, start_date: s, end_date: e } });
      onDone();
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  return (
    <Modal title={`Book ${car.year} ${car.make} ${car.model}`} onClose={onClose}>
      <div className="two">
        <div><label>Pick-up</label><input type="date" min={todayStr()} value={s} onChange={x => setS(x.target.value)} /></div>
        <div><label>Return</label><input type="date" min={s} value={e} onChange={x => setE(x.target.value)} /></div>
      </div>
      <div className="card" style={{ padding: 14, margin: "16px 0" }}>
        <div className="row"><span>{money(car.price_per_day)} × {days} day{days === 1 ? "" : "s"}</span><b style={{ fontSize: 20 }}>{money(days * car.price_per_day)}</b></div>
      </div>
      {err && <div className="err">{err}</div>}
      <button className="btn" style={{ width: "100%", marginTop: 8 }} disabled={busy || !days} onClick={submit}>{busy ? "Sending…" : "Request booking"}</button>
    </Modal>
  );
}

function CarsPage({ user, go }) {
  const toast = useToast();
  const [cars, setCars] = useState(null);
  const [f, setF] = useState({ search: "", max_price: "", transmission: "", fuel: "" });
  const [booking, setBooking] = useState(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
      try { setCars(await api("/cars/" + (q ? "?" + q : ""))); }
      catch (e) { setCars([]); toast(e.message, "err"); }
    }, 300);
    return () => clearTimeout(t);
  }, [f]);

  const set = k => e => setF({ ...f, [k]: e.target.value });
  const onBook = c => { if (!user) return go("login"); setBooking(c); };

  return (
    <>
      <h1>Find your ride</h1>
      <p className="sub">Browse available cars and book in seconds.</p>
      <div className="card filters">
        <input placeholder="Search make, model or city…" value={f.search} onChange={set("search")} />
        <input type="number" placeholder={`Max ${CURRENCY}/day`} value={f.max_price} onChange={set("max_price")} />
        <select value={f.transmission} onChange={set("transmission")}><option value="">Any gearbox</option><option value="manual">Manual</option><option value="auto">Automatic</option></select>
        <select value={f.fuel} onChange={set("fuel")}><option value="">Any fuel</option><option value="petrol">Petrol</option><option value="diesel">Diesel</option><option value="electric">Electric</option><option value="hybrid">Hybrid</option></select>
      </div>
      {cars === null ? <div className="empty">Loading…</div> : cars.length === 0 ? <div className="empty">No cars found.</div> : (
        <div className="grid">
          {cars.map(c => (
            <div className="card car" key={c.id}>
              <div className="img">{c.image_url ? <img src={c.image_url} alt="" onError={e => (e.target.style.display = "none")} /> : "🚗"}</div>
              <div className="body">
                <h3>{c.year} {c.make} {c.model}</h3>
                <div className="sub" style={{ margin: 0, fontSize: 13 }}>{c.location || "Location on request"} · by {c.owner_name}</div>
                <div className="tags"><span className="tag">{c.seats} seats</span><span className="tag">{c.transmission}</span><span className="tag">{c.fuel}</span></div>
                <div className="row">
                  <div className="price">{money(c.price_per_day)}<small> /day</small></div>
                  <button className="btn sm" disabled={user && user.role === "renter"} title={user && user.role === "renter" ? "Renter accounts can't book" : ""} onClick={() => onBook(c)}>Book</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {booking && <BookModal car={booking} onClose={() => setBooking(null)} onDone={() => { setBooking(null); toast("Booking requested!"); go("dashboard"); }} />}
    </>
  );
}

/* ================= RENTER: FLEET ================= */
const blankCar = { make: "", model: "", year: new Date().getFullYear(), price_per_day: "", seats: 5, transmission: "manual", fuel: "petrol", location: "", image_url: "", description: "", available: true };

function CarForm({ car, onClose, onSaved }) {
  const [f, setF] = useState(car || blankCar);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const submit = async e => {
    e.preventDefault(); setErr(""); setBusy(true);
    const body = { make: f.make, model: f.model, year: +f.year, price_per_day: f.price_per_day, seats: +f.seats, transmission: f.transmission, fuel: f.fuel, location: f.location, image_url: f.image_url, description: f.description, available: f.available };
    try {
      await api(car ? `/cars/${car.id}/` : "/cars/", { method: car ? "PATCH" : "POST", body });
      onSaved();
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  return (
    <Modal title={car ? "Edit car" : "Add a car"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="two">
          <div><label>Make</label><input required value={f.make} onChange={set("make")} /></div>
          <div><label>Model</label><input required value={f.model} onChange={set("model")} /></div>
          <div><label>Year</label><input required type="number" value={f.year} onChange={set("year")} /></div>
          <div><label>Price / day ({CURRENCY})</label><input required type="number" step="0.01" min="0" value={f.price_per_day} onChange={set("price_per_day")} /></div>
          <div><label>Seats</label><input type="number" min="1" value={f.seats} onChange={set("seats")} /></div>
          <div><label>Location</label><input value={f.location} onChange={set("location")} /></div>
          <div><label>Gearbox</label><select value={f.transmission} onChange={set("transmission")}><option value="manual">Manual</option><option value="auto">Automatic</option></select></div>
          <div><label>Fuel</label><select value={f.fuel} onChange={set("fuel")}><option value="petrol">Petrol</option><option value="diesel">Diesel</option><option value="electric">Electric</option><option value="hybrid">Hybrid</option></select></div>
        </div>
        <label>Image URL</label><input type="url" placeholder="https://…" value={f.image_url} onChange={set("image_url")} />
        <label>Description</label><textarea rows="3" value={f.description} onChange={set("description")} />
        <label style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text)" }}><input type="checkbox" style={{ width: "auto" }} checked={f.available} onChange={set("available")} /> Available for rent</label>
        {err && <div className="err">{err}</div>}
        <button className="btn" style={{ width: "100%", marginTop: 14 }} disabled={busy}>{busy ? "Saving…" : "Save car"}</button>
      </form>
    </Modal>
  );
}

function Fleet({ onChange }) {
  const toast = useToast();
  const [cars, setCars] = useState(null);
  const [edit, setEdit] = useState(null); // null | "new" | car
  const load = useCallback(async () => {
    try { setCars(await api("/cars/mine/")); } catch (e) { setCars([]); toast(e.message, "err"); }
  }, []);
  useEffect(() => { load(); }, []);

  const del = async c => {
    if (!confirm(`Delete ${c.make} ${c.model}? Its bookings will be deleted too.`)) return;
    try { await api(`/cars/${c.id}/`, { method: "DELETE" }); toast("Car deleted"); load(); onChange(); } catch (e) { toast(e.message, "err"); }
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>My fleet</h2><button className="btn sm" onClick={() => setEdit("new")}>+ Add car</button></div>
      {cars === null ? <div className="empty">Loading…</div> : cars.length === 0 ? <div className="card empty">You haven't listed any cars yet.</div> : (
        <div className="card tbl"><table>
          <thead><tr><th>Car</th><th>Price/day</th><th>Location</th><th>Status</th><th></th></tr></thead>
          <tbody>{cars.map(c => (
            <tr key={c.id}>
              <td><b>{c.year} {c.make} {c.model}</b></td><td>{money(c.price_per_day)}</td><td>{c.location || "—"}</td>
              <td><Badge s={c.available ? "confirmed" : "cancelled"} />{" "}{c.available ? "available" : "hidden"}</td>
              <td style={{ textAlign: "right" }}><button className="btn ghost sm" onClick={() => setEdit(c)}>Edit</button>{" "}<button className="btn bad sm" onClick={() => del(c)}>Delete</button></td>
            </tr>))}</tbody>
        </table></div>
      )}
      {edit && <CarForm car={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); toast("Car saved"); load(); onChange(); }} />}
    </>
  );
}

/* ================= DASHBOARD (both roles) ================= */
function BookingsTable({ bookings, isRenter, act }) {
  if (!bookings.length) return <div className="card empty">{isRenter ? "No booking requests yet." : "You haven't booked anything yet."}</div>;
  return (
    <div className="card tbl"><table>
      <thead><tr><th>Car</th>{isRenter && <th>Customer</th>}<th>Dates</th><th>Total</th><th>Status</th><th></th></tr></thead>
      <tbody>{bookings.map(b => (
        <tr key={b.id}>
          <td><b>{b.car_detail.make} {b.car_detail.model}</b></td>
          {isRenter && <td>{b.customer_name}</td>}
          <td>{b.start_date} → {b.end_date}</td><td>{money(b.total_price)}</td><td><Badge s={b.status} /></td>
          <td style={{ textAlign: "right" }}>
            {isRenter && b.status === "pending" && <><button className="btn ok sm" onClick={() => act(b.id, "confirm")}>Confirm</button>{" "}<button className="btn bad sm" onClick={() => act(b.id, "reject")}>Reject</button></>}
            {!isRenter && ["pending", "confirmed"].includes(b.status) && <button className="btn ghost sm" onClick={() => act(b.id, "cancel")}>Cancel</button>}
          </td>
        </tr>))}</tbody>
    </table></div>
  );
}

function Dashboard({ user }) {
  const toast = useToast();
  const isRenter = user.role === "renter";
  const [d, setD] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [tab, setTab] = useState("bookings");

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([api("/dashboard/"), api("/bookings/")]);
      setD(a); setBookings(b);
    } catch (e) { toast(e.message, "err"); }
  }, []);
  useEffect(() => { load(); }, []);

  const act = async (id, a) => {
    try { await api(`/bookings/${id}/${a}/`, { method: "POST" }); toast(`Booking ${a}${a.endsWith("e") ? "d" : "ed"}`); load(); }
    catch (e) { toast(e.message, "err"); }
  };

  const stats = !d ? [] : isRenter
    ? [["My cars", d.total_cars], ["Pending requests", d.pending_requests], ["Confirmed bookings", d.confirmed_bookings], ["Revenue", money(d.revenue)]]
    : [["Total bookings", d.total_bookings], ["Pending", d.pending], ["Confirmed", d.confirmed], ["Total spent", money(d.total_spent)]];

  return (
    <>
      <h1>{isRenter ? "Renter dashboard" : "My dashboard"}</h1>
      <p className="sub">Hi {user.username} 👋 {isRenter ? "Manage your fleet and booking requests." : "Track your rentals here."}</p>
      <div className="stats">{stats.map(([l, v]) => <div className="card stat" key={l}><span>{l}</span><b>{v}</b></div>)}</div>
      {isRenter && (
        <div className="tabs">
          <button className={"link " + (tab === "bookings" ? "active" : "")} onClick={() => setTab("bookings")}>Booking requests</button>
          <button className={"link " + (tab === "fleet" ? "active" : "")} onClick={() => setTab("fleet")}>My fleet</button>
        </div>
      )}
      {(!isRenter || tab === "bookings") ? (
        <><h2>{isRenter ? "Booking requests" : "My bookings"}</h2><BookingsTable bookings={bookings} isRenter={isRenter} act={act} /></>
      ) : <Fleet onChange={load} />}
    </>
  );
}

/* ================= APP SHELL ================= */
function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem("user") || "null"));
  const [page, setPage] = useState(() => location.hash.slice(1) || "cars");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const h = () => setPage(location.hash.slice(1) || "cars");
    const out = () => setUser(null);
    addEventListener("hashchange", h); addEventListener("session-ended", out);
    return () => { removeEventListener("hashchange", h); removeEventListener("session-ended", out); };
  }, []);

  const show = (msg, type) => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };
  const go = p => { location.hash = p; };
  const onAuth = d => {
    localStorage.setItem("access", d.access); localStorage.setItem("refresh", d.refresh);
    localStorage.setItem("user", JSON.stringify(d.user));
    setUser(d.user); show("Welcome, " + d.user.username + "!"); go("dashboard");
  };
  const logout = () => { clearSession(); go("cars"); };
  const changeApi = () => {
    const v = prompt("Backend API URL:", getApi());
    if (v) { localStorage.setItem("apiBase", v.replace(/\/$/, "")); location.reload(); }
  };

  let view;
  if (page === "login" || page === "register") view = <AuthPage key={page} mode={page} go={go} onAuth={onAuth} />;
  else if (page === "dashboard") view = user ? <Dashboard user={user} /> : <AuthPage mode="login" go={go} onAuth={onAuth} />;
  else view = <CarsPage user={user} go={go} />;

  return (
    <ToastCtx.Provider value={show}>
      <nav><div className="wrap">
        <div className="logo" onClick={() => go("cars")}>Drive<span>Easy</span></div>
        <button className={"link " + (page === "cars" ? "active" : "")} onClick={() => go("cars")}>Cars</button>
        {user ? (<>
          <button className={"link " + (page === "dashboard" ? "active" : "")} onClick={() => go("dashboard")}>Dashboard</button>
          <span className="tag">{user.role}</span>
          <button className="btn ghost sm" onClick={logout}>Log out</button>
        </>) : (<>
          <button className="link" onClick={() => go("login")}>Log in</button>
          <button className="btn sm" onClick={() => go("register")}>Sign up</button>
        </>)}
      </div></nav>
      <div className="wrap" style={{ paddingBottom: 20 }}>{view}</div>
      <footer>API: {getApi()} · <a onClick={changeApi}>change</a></footer>
      {toast && <div className={"toast " + (toast.type || "")}>{toast.msg}</div>}
    </ToastCtx.Provider>
  );
}

export default App;
