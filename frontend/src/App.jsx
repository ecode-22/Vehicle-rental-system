import { useState, useEffect, useCallback, useContext, createContext } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { BadgeCheck, CalendarDays, CarFront, CircleDollarSign, Clock3, LocateFixed, MapPin, MapPinned, Plus, Search } from "lucide-react";
import "leaflet/dist/leaflet.css";

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
  const multipart = typeof FormData !== "undefined" && body instanceof FormData;
  const requestBody = body ? multipart ? body : JSON.stringify(body) : undefined;
  const run = () => {
    const headers = multipart ? {} : { "Content-Type": "application/json" };
    const t = localStorage.getItem("access");
    if (auth && t) headers.Authorization = "Bearer " + t;
    return fetch(getApi() + path, { method, headers, body: requestBody });
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
        const headers = multipart ? {} : { "Content-Type": "application/json" };
        res = await fetch(getApi() + path, { method, headers, body: requestBody });
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

async function locatePlace(place) {
  if (!place.trim()) return null;
  try {
    const query = new URLSearchParams({ q: `${place}, South Africa`, format: "jsonv2", limit: "1", countrycodes: "za" });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${query}`);
    if (!response.ok) return null;
    const [result] = await response.json();
    return result ? [Number(result.lat), Number(result.lon)] : null;
  } catch {
    return null;
  }
}

function distanceKm([lat1, lon1], [lat2, lon2]) {
  const radians = value => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function MapFrame({ points, origin }) {
  const map = useMap();
  useEffect(() => {
    const locations = origin ? [...points, origin] : points;
    if (locations.length) map.fitBounds(L.latLngBounds(locations), { padding: [28, 28], maxZoom: 11 });
  }, [map, points, origin]);
  return null;
}

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
  const [mapCars, setMapCars] = useState([]);
  const [f, setF] = useState({ search: "", max_price: "", transmission: "", fuel: "" });
  const [place, setPlace] = useState("");
  const [origin, setOrigin] = useState(null);
  const [locating, setLocating] = useState(false);
  const [booking, setBooking] = useState(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
      try { setCars(await api("/cars/" + (q ? "?" + q : ""))); }
      catch (e) { setCars([]); toast(e.message, "err"); }
    }, 300);
    return () => clearTimeout(t);
  }, [f]);

  useEffect(() => {
    if (!cars) return undefined;
    let active = true;
    const resolveCars = async () => {
      const resolved = [];
      for (const car of cars) {
        const coordinates = await locatePlace(car.location || "");
        resolved.push({ ...car, coordinates });
        if (active) setMapCars([...resolved, ...cars.slice(resolved.length)]);
      }
    };
    resolveCars();
    return () => { active = false; };
  }, [cars]);

  const set = k => e => setF({ ...f, [k]: e.target.value });
  const onBook = c => { if (!user) return go("login"); setBooking(c); };
  const searchPlace = async e => {
    e.preventDefault();
    if (!place.trim()) return;
    setLocating(true);
    const point = await locatePlace(place);
    setLocating(false);
    if (!point) return toast("We couldn't find that South African location. Try a nearby town or city.", "err");
    setOrigin(point);
  };
  const useMyLocation = () => {
    if (!navigator.geolocation) return toast("Location services aren't available in this browser.", "err");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        setOrigin([position.coords.latitude, position.coords.longitude]);
        setPlace("Your current location");
        setLocating(false);
      },
      () => { setLocating(false); toast("Location permission was unavailable. Enter a town or city instead.", "err"); },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  };

  const sortedCars = origin
    ? mapCars.map(car => ({ ...car, distance: car.coordinates ? distanceKm(origin, car.coordinates) : null }))
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
    : mapCars;
  const mapPoints = mapCars.filter(car => car.coordinates);
  const mapCenter = origin || mapPoints[0]?.coordinates || [-33.9, 18.7];

  return (
    <main className="browse-page">
      <section className="browse-intro">
        <div className="intro-copy">
          <span className="eyebrow">DRIVEEASY · SOUTH AFRICA</span>
          <h1>Good journeys start nearby.</h1>
          <p className="sub">Find a car close to your pickup point, then book directly with its owner.</p>
        </div>
        <form className="location-search" onSubmit={searchPlace}>
          <label htmlFor="pickup-location"><MapPin size={17} /> Pickup location</label>
          <div className="location-controls">
            <input id="pickup-location" placeholder="Town, city or suburb" value={place} onChange={e => setPlace(e.target.value)} />
            <button className="icon-button" type="button" onClick={useMyLocation} disabled={locating} aria-label="Use my current location" title="Use my current location"><LocateFixed size={19} /></button>
            <button className="btn find-button" type="submit" disabled={locating || !place.trim()}><Search size={17} />{locating ? "Locating" : "Find cars"}</button>
          </div>
          <span className="location-note">{origin ? "Sorted by distance from your pickup point · town-level estimates" : "Enter a location or use your device location to find nearby cars"}</span>
        </form>
      </section>

      <section className="browse-tools" aria-label="Filter cars">
        <div className="results-heading"><div><span className="eyebrow">THE FLEET</span><h2>Cars around you</h2></div><span className="result-count">{cars?.length ?? "..."} available</span></div>
        <div className="filters">
          <label className="filter-field"><span>Search</span><input placeholder="Make or model" value={f.search} onChange={set("search")} /></label>
          <label className="filter-field"><span>Maximum per day</span><input type="number" placeholder={`${CURRENCY} Any price`} value={f.max_price} onChange={set("max_price")} /></label>
          <label className="filter-field"><span>Transmission</span><select value={f.transmission} onChange={set("transmission")}><option value="">Any type</option><option value="manual">Manual</option><option value="auto">Automatic</option></select></label>
          <label className="filter-field"><span>Fuel</span><select value={f.fuel} onChange={set("fuel")}><option value="">Any fuel</option><option value="petrol">Petrol</option><option value="diesel">Diesel</option><option value="electric">Electric</option><option value="hybrid">Hybrid</option></select></label>
        </div>
      </section>

      <section className="results-layout">
        <div className="results-list">
          {cars === null ? <div className="empty">Loading available cars…</div> : sortedCars.length === 0 ? <div className="empty">No cars found. Try adjusting your filters.</div> : (
            <div className="grid">
              {sortedCars.map(c => (
                <article className="card car" key={c.id}>
                  <div className="img">{c.image || c.image_url ? <img src={c.image || c.image_url} alt={`${c.year} ${c.make} ${c.model}`} onError={e => (e.target.style.display = "none")} /> : <CarFront size={44} strokeWidth={1.3} />}</div>
                  <div className="body">
                    <div className="car-location"><MapPin size={14} />{c.location || "Location on request"}{c.distance !== null && c.distance !== undefined && <span>{Math.round(c.distance)} km</span>}</div>
                    <h3>{c.year} {c.make} {c.model}</h3>
                    <div className="car-owner">Listed by {c.owner_name}</div>
                    <div className="tags"><span className="tag">{c.seats} seats</span><span className="tag">{c.transmission}</span><span className="tag">{c.fuel}</span></div>
                    <div className="row car-price-row"><div className="price">{money(c.price_per_day)}<small> /day</small></div><button className="btn sm" disabled={user && user.role === "renter"} title={user && user.role === "renter" ? "Renter accounts can't book" : "Request this car"} onClick={() => onBook(c)}>View & book</button></div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
        <aside className="map-panel" aria-label="Car pickup locations map">
          <div className="map-heading"><div><MapPinned size={18} /><b>Pickup locations</b></div><span>{mapPoints.length} mapped</span></div>
          <MapContainer center={mapCenter} zoom={9} scrollWheelZoom={false} className="pickup-map">
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <MapFrame points={mapPoints.map(car => car.coordinates)} origin={origin} />
            {origin && <CircleMarker center={origin} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#167d68", fillOpacity: 1 }}><Popup>Your pickup location</Popup></CircleMarker>}
            {mapPoints.map(car => <CircleMarker key={car.id} center={car.coordinates} radius={7} pathOptions={{ color: "#fff", weight: 2, fillColor: "#d9523b", fillOpacity: 1 }}><Popup><b>{car.year} {car.make} {car.model}</b><br />{car.location}<br />{money(car.price_per_day)} / day</Popup></CircleMarker>)}
          </MapContainer>
          <p className="map-footnote">Pins show the town or city supplied by the renter, not an exact vehicle address.</p>
        </aside>
      </section>
      {booking && <BookModal car={booking} onClose={() => setBooking(null)} onDone={() => { setBooking(null); toast("Booking requested!"); go("dashboard"); }} />}
    </main>
  );
}

/* ================= RENTER: FLEET ================= */
const blankCar = { make: "", model: "", year: new Date().getFullYear(), price_per_day: "", seats: 5, transmission: "manual", fuel: "petrol", location: "", image_url: "", description: "", available: true };

function CarForm({ car, onClose, onSaved }) {
  const [f, setF] = useState(car || blankCar);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [preview, setPreview] = useState(car?.image || car?.image_url || "");
  const set = k => e => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  useEffect(() => {
    if (!imageFile) return undefined;
    const previewUrl = URL.createObjectURL(imageFile);
    setPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile]);

  const submit = async e => {
    e.preventDefault(); setErr(""); setBusy(true);
    const body = new FormData();
    Object.entries({ make: f.make, model: f.model, year: +f.year, price_per_day: f.price_per_day, seats: +f.seats, transmission: f.transmission, fuel: f.fuel, location: f.location, image_url: f.image_url, description: f.description, available: f.available }).forEach(([key, value]) => body.append(key, String(value)));
    if (imageFile) body.append("image", imageFile);
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
        <label>Upload car photo</label>
        <div className="image-upload">
          <div className="image-preview">{preview ? <img src={preview} alt="Selected car preview" /> : <CarFront size={30} />}</div>
          <div className="image-upload-control"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => {
            const file = e.target.files?.[0] || null;
            if (file && file.size > 8 * 1024 * 1024) { setErr("Choose an image smaller than 8 MB."); e.target.value = ""; return; }
            setErr(""); setImageFile(file);
          }} /><small>JPG, PNG or WebP · max 8 MB</small></div>
        </div>
        <label>Or use an image URL</label><input type="url" placeholder="https://…" value={f.image_url} onChange={set("image_url")} />
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
    ? [
      { label: "Vehicles listed", value: d.total_cars, icon: CarFront, tone: "coral" },
      { label: "Needs your attention", value: d.pending_requests, icon: Clock3, tone: "gold" },
      { label: "Confirmed rentals", value: d.confirmed_bookings, icon: BadgeCheck, tone: "green" },
      { label: "Rental revenue", value: money(d.revenue), icon: CircleDollarSign, tone: "blue" }
    ]
    : [
      { label: "Total bookings", value: d.total_bookings, icon: CalendarDays, tone: "coral" },
      { label: "Pending", value: d.pending, icon: Clock3, tone: "gold" },
      { label: "Confirmed", value: d.confirmed, icon: BadgeCheck, tone: "green" },
      { label: "Total spent", value: money(d.total_spent), icon: CircleDollarSign, tone: "blue" }
    ];

  return (
    <main className="dashboard-page">
      <header className="dashboard-hero">
        <div>
          <span className="eyebrow">{isRenter ? "OWNER WORKSPACE" : "YOUR DRIVE EASY ACCOUNT"}</span>
          <h1>{isRenter ? "Your rental business, in view." : "Your journeys, in one place."}</h1>
          <p>{isRenter ? `Welcome back, ${user.username}. Keep your fleet moving.` : `Welcome back, ${user.username}. Review your rental activity.`}</p>
        </div>
        {isRenter && <button className="btn dashboard-add" onClick={() => setTab("fleet")}><Plus size={17} /> Add a vehicle</button>}
      </header>
      <section className="stats" aria-label="Account overview">
        {stats.map(({ label, value, icon: Icon, tone }) => <article className="card stat" key={label}>
          <span className={`stat-icon ${tone}`}><Icon size={19} /></span><span className="stat-label">{label}</span><b>{value}</b>
        </article>)}
      </section>
      {isRenter && (
        <div className="tabs dashboard-tabs" role="tablist" aria-label="Renter workspace">
          <button role="tab" aria-selected={tab === "bookings"} className={tab === "bookings" ? "active" : ""} onClick={() => setTab("bookings")}><CalendarDays size={17} /> Booking requests <span>{bookings.filter(b => b.status === "pending").length}</span></button>
          <button role="tab" aria-selected={tab === "fleet"} className={tab === "fleet" ? "active" : ""} onClick={() => setTab("fleet")}><CarFront size={17} /> My fleet</button>
        </div>
      )}
      {(!isRenter || tab === "bookings") ? (
        <section className="dashboard-section">
          <div className="section-heading"><div><span className="eyebrow">{isRenter ? "STAY ON TOP OF EVERY REQUEST" : "YOUR RESERVATIONS"}</span><h2>{isRenter ? "Booking requests" : "My bookings"}</h2></div><span>{bookings.length} total</span></div>
          <BookingsTable bookings={bookings} isRenter={isRenter} act={act} />
        </section>
      ) : <Fleet onChange={load} />}
    </main>
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
    <><ToastCtx.Provider value={show}>
      <nav><div className="wrap">
        <div className="logo" onClick={() => go("cars")}>GO</div>
        <button className={"link " + (page === "cars" ? "active" : "")} onClick={() => go("cars")}>Cars</button>
        {user ? (<>
          <button className={"link " + (page === "dashboard" ? "active" : "")} onClick={() => go("dashboard")}>Dashboard</button>
          <span className="tag">{user.role}</span>
          <button className="btn ghost sm" onClick={logout}>Log out</button>
        </>) : (<>
          <button className="link" onClick={() => go("login")}>Log in</button>
          <button className="btn sm" onClick={() => go("register")}>Sign up</button>
        </>)}
      </div></nav><div className="wrap" style={{ paddingBottom: 20 }}>{view}</div><footer>API: {getApi()} · <a onClick={changeApi}>change</a></footer>
      {toast && <div className={"toast " + (toast.type || "")}>{toast.msg}</div>}
    </ToastCtx.Provider></>
  );
}

export default App;
