import { useState, useEffect, useCallback, useContext, createContext } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { CarFront, Flag, MapPin, MapPinned, Star } from "lucide-react";
import { api, clearSession } from "./services/api.js";
import Modal from "./components/Modal.jsx";
import MapView from "./components/MapView.jsx";
import StatusBadge from "./components/StatusBadge.jsx";
import Navigation from "./components/Navigation.jsx";
import RequestIndicator from "./components/RequestIndicator.jsx";
import HomeDiscovery from "./pages/HomeDiscovery.jsx";
import CarDetail from "./pages/CarDetail.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import DashboardView from "./pages/DashboardView.jsx";
import TrustAndSafety from "./pages/TrustAndSafety.jsx";
import HandoverUnavailable from "./pages/HandoverUnavailable.jsx";
import "leaflet/dist/leaflet.css";

/* ================= CONFIG & API ================= */
const CURRENCY = "R";
const placeCache = new Map();

const money = n => CURRENCY + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

async function locatePlace(place) {
  const normalizedPlace = place.trim().toLowerCase();
  if (!normalizedPlace) return null;
  if (placeCache.has(normalizedPlace)) return placeCache.get(normalizedPlace);
  try {
    const query = new URLSearchParams({ q: `${place}, South Africa`, format: "jsonv2", limit: "1", countrycodes: "za" });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${query}`);
    if (!response.ok) return null;
    const [result] = await response.json();
    const coordinates = result ? [Number(result.lat), Number(result.lon)] : null;
    if (coordinates) placeCache.set(normalizedPlace, coordinates);
    return coordinates;
  } catch {
    return null;
  }
}

async function suggestPlaces(query) {
  const params = new URLSearchParams({ q: `${query}, South Africa`, format: "jsonv2", addressdetails: "1", limit: "5", countrycodes: "za" });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
  if (!response.ok) return [];
  return response.json();
}

function placeLabel(place) {
  const address = place.address || {};
  return [...new Set([
    address.road,
    address.suburb || address.neighbourhood,
    address.city || address.town || address.village || address.municipality,
    address.state
  ].filter(Boolean))].join(", ") || place.display_name;
}

/* ================= SHARED UI ================= */
const ToastCtx = createContext(() => {});
const useToast = () => useContext(ToastCtx);

function LocationInput({ id, label, value, onChange, required = false, placeholder = "Start typing a South African town or address" }) {
  const [suggestions, setSuggestions] = useState([]);
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (value.trim().length < 3) { setSuggestions([]); return undefined; }
    let active = true;
    const timer = setTimeout(() => suggestPlaces(value).then(results => { if (active) setSuggestions(results); }).catch(() => { if (active) setSuggestions([]); }), 1000);
    return () => { active = false; clearTimeout(timer); };
  }, [value]);
  return (
    <div className="location-picker">
      <label htmlFor={id}>{label}</label>
      <input id={id} required={required} autoComplete="off" placeholder={placeholder} value={value} onFocus={() => setActive(true)} onChange={e => { onChange(e.target.value, null); setActive(true); }} />
      {active && suggestions.length > 0 && <div className="location-suggestions" role="listbox">
        {suggestions.map(place => <button type="button" role="option" key={place.place_id} onClick={() => { onChange(placeLabel(place), [Number(place.lat), Number(place.lon)]); setSuggestions([]); setActive(false); }}><MapPin size={14} /><span>{placeLabel(place)}</span></button>)}
      </div>}
    </div>
  );
}

/* ================= SHARED MODALS ================= */
function ReviewModal({ booking, user, onClose, onDone }) {
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const isRenter = user.role === "renter";
  const submit = async e => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      await api("/reviews/", { method: "POST", body: {
        booking_id: booking.id,
        ...(isRenter ? { target_user: booking.customer } : { target_car: booking.car }),
        score, comment
      } });
      onDone();
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };
  return (
    <Modal title={isRenter ? `Rate ${booking.customer_name}` : `Rate ${booking.car_detail.make} ${booking.car_detail.model}`} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="sub">Your rating is linked to this completed rental.</p>
        <label>Your rating</label>
        <div className="rating-picker" role="radiogroup" aria-label="Rating from one to five stars">
          {[1, 2, 3, 4, 5].map(value => <button type="button" key={value} role="radio" aria-checked={score === value} aria-label={`${value} star${value === 1 ? "" : "s"}`} className={value <= score ? "selected" : ""} onClick={() => setScore(value)}><Star size={27} fill="currentColor" /></button>)}
        </div>
        <label htmlFor="review-comment">Comment (optional)</label><textarea id="review-comment" rows="3" maxLength="1000" value={comment} onChange={e => setComment(e.target.value)} />
        {err && <div className="err">{err}</div>}
        <button className="btn" style={{ width: "100%", marginTop: 14 }} disabled={busy}>{busy ? "Submitting…" : "Submit rating"}</button>
      </form>
    </Modal>
  );
}

function ReportModal({ car, onClose, onDone }) {
  const [description, setDescription] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      await api("/problem-reports/", { method: "POST", body: { car: car.id, description } });
      onDone();
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };
  return (
    <Modal title={`Report a problem · ${car.make} ${car.model}`} onClose={onClose}>
      <form onSubmit={submit}>
        <label htmlFor="problem-description">Describe the issue</label><textarea id="problem-description" required minLength="8" maxLength="2000" rows="4" value={description} onChange={e => setDescription(e.target.value)} placeholder="What needs attention on this vehicle?" />
        {err && <div className="err">{err}</div>}
        <button className="btn" style={{ width: "100%", marginTop: 14 }} disabled={busy}>{busy ? "Sending…" : "Send report"}</button>
      </form>
    </Modal>
  );
}

function BookingMapModal({ booking, onClose }) {
  const [points, setPoints] = useState([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    const car = booking.car_detail;
    const collectionCoordinates = car.latitude != null && car.longitude != null ? [car.latitude, car.longitude] : null;
    Promise.all([collectionCoordinates || locatePlace(booking.collection_location), locatePlace(booking.dropoff_location)]).then(result => {
      if (active) { setPoints(result.filter(Boolean)); setLoaded(true); }
    });
    return () => { active = false; };
  }, [booking.id]);
  return (
    <Modal title={`${booking.car_detail.make} ${booking.car_detail.model} · Handover map`} onClose={onClose} className="handover-modal">
      <div className="handover-points"><div><MapPin size={16} /><span><small>Collection</small>{booking.collection_location}</span></div><div><MapPinned size={16} /><span><small>Drop-off</small>{booking.dropoff_location}</span></div></div>
      {points.length > 0 ? <MapView center={points[0]} markers={points.map((point, index) => ({ id: index, position: point, color: index ? "#f07b65" : "#48d3a3", popup: index ? "Drop-off" : "Collection" }))} className="handover-map" /> : <div className="empty">{loaded ? "We could not map one or both handover points." : "Loading map locations…"}</div>}
      <p className="map-footnote">Pins are approximate geocoded handover points. Live vehicle tracking requires compatible GPS hardware and renter consent.</p>
    </Modal>
  );
}

/* ================= RENTER: FLEET ================= */
const blankCar = { make: "", model: "", year: new Date().getFullYear(), price_per_day: "", seats: 5, transmission: "manual", fuel: "petrol", location: "", collection_location: "", dropoff_location: "", latitude: null, longitude: null, image_url: "", description: "", available: true };

function CarForm({ car, onClose, onSaved }) {
  const [f, setF] = useState(car || blankCar);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageFiles, setImageFiles] = useState([]);
  const [newPreviews, setNewPreviews] = useState([]);
  const oldPhotos = [...(car?.photos || []).map(photo => photo.image), car?.image, car?.image_url].filter(Boolean);
  const fValue = { ...f, collection_location: f.collection_location || car?.location || "", dropoff_location: f.dropoff_location || car?.location || "" };
  const set = k => e => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  useEffect(() => {
    const previewUrls = imageFiles.map(file => URL.createObjectURL(file));
    setNewPreviews(previewUrls);
    return () => previewUrls.forEach(URL.revokeObjectURL);
  }, [imageFiles]);

  const submit = async e => {
    e.preventDefault(); setErr(""); setBusy(true);
    const body = new FormData();
    Object.entries({ make: f.make, model: f.model, year: +f.year, price_per_day: f.price_per_day, seats: +f.seats, transmission: f.transmission, fuel: f.fuel, location: fValue.collection_location, collection_location: fValue.collection_location, dropoff_location: fValue.dropoff_location, latitude: f.latitude ?? "", longitude: f.longitude ?? "", image_url: f.image_url, description: f.description, available: f.available }).forEach(([key, value]) => body.append(key, String(value)));
    imageFiles.forEach(file => body.append("photos", file));
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
          <div><label>Gearbox</label><select value={f.transmission} onChange={set("transmission")}><option value="manual">Manual</option><option value="auto">Automatic</option></select></div>
          <div><label>Fuel</label><select value={f.fuel} onChange={set("fuel")}><option value="petrol">Petrol</option><option value="diesel">Diesel</option><option value="electric">Electric</option><option value="hybrid">Hybrid</option></select></div>
        </div>
        <div className="two location-fields">
          <LocationInput id="collection-location" label="Collection location *" required value={fValue.collection_location} onChange={(value, coordinates) => setF({ ...f, collection_location: value, location: value, latitude: coordinates?.[0] ?? null, longitude: coordinates?.[1] ?? null })} />
          <LocationInput id="dropoff-location" label="Drop-off location *" required value={fValue.dropoff_location} onChange={value => setF({ ...f, dropoff_location: value })} />
        </div>
        <label>Car photos <span className="sub">(up to {Math.max(0, 10 - oldPhotos.length)} more)</span></label>
        <div className="image-upload gallery-upload">
          <div className="photo-previews">{oldPhotos.map((photo, index) => <div className="photo-preview" key={`old-${index}`}><img src={photo} alt={`Current car photo ${index + 1}`} /></div>)}{newPreviews.map((photo, index) => <div className="photo-preview" key={`new-${index}`}><img src={photo} alt={`New car photo ${index + 1}`} /></div>)}{!oldPhotos.length && !newPreviews.length && <div className="photo-placeholder"><CarFront size={26} /></div>}</div>
          <div className="image-upload-control"><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => {
            const files = Array.from(e.target.files || []);
            const total = oldPhotos.length + files.length;
            if (total > 10) { setErr("A car can have up to 10 photos."); e.target.value = ""; return; }
            if (files.some(file => file.size > 8 * 1024 * 1024)) { setErr("Each photo must be 8 MB or smaller."); e.target.value = ""; return; }
            setErr(""); setImageFiles(files);
          }} /><small>Select several JPG, PNG or WebP photos · max 8 MB each</small></div>
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
  const [reportCar, setReportCar] = useState(null);
  const [reports, setReports] = useState([]);
  const load = useCallback(async () => {
    try {
      const [mine, ownReports] = await Promise.all([api("/cars/mine/"), api("/problem-reports/")]);
      setCars(mine); setReports(ownReports);
    } catch (e) { setCars([]); toast(e.message, "err"); }
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
          <thead><tr><th>Car</th><th>Price/day</th><th>Location</th><th>Status</th><th>Latest report</th><th></th></tr></thead>
          <tbody>{cars.map(c => (
            <tr key={c.id}>
              <td><b>{c.year} {c.make} {c.model}</b></td><td>{money(c.price_per_day)}</td><td>{c.location || "—"}</td>
              <td><StatusBadge status={c.available ? "confirmed" : "cancelled"} />{" "}{c.available ? "available" : "hidden"}</td>
              <td>{reports.find(report => report.car === c.id) ? <StatusBadge status={reports.find(report => report.car === c.id).status} /> : <span className="sub">None</span>}</td>
              <td style={{ textAlign: "right" }}><button className="icon-button table-icon" title="Report a vehicle problem" aria-label={`Report a problem with ${c.make} ${c.model}`} onClick={() => setReportCar(c)}><Flag size={16} /></button>{" "}<button className="btn ghost sm" onClick={() => setEdit(c)}>Edit</button>{" "}<button className="btn bad sm" onClick={() => del(c)}>Delete</button></td>
            </tr>))}</tbody>
        </table></div>
      )}
      {edit && <CarForm car={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); toast("Car saved"); load(); onChange(); }} />}
      {reportCar && <ReportModal car={reportCar} onClose={() => setReportCar(null)} onDone={() => { setReportCar(null); toast("Report sent to the support team"); load(); }} />}
    </>
  );
}

/* ================= APP SHELL ================= */
function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem("user") || "null"));
  const [toast, setToast] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const path = location.pathname;
  const page = path === "/login" ? "login" : path === "/register" ? "register" : path === "/trust" ? "trust" : ["/trips", "/admin/fleet"].includes(path) || /^\/bookings\/\d+\/handover$/.test(path) ? "dashboard" : "cars";

  useEffect(() => {
    const out = () => setUser(null);
    addEventListener("session-ended", out);
    return () => removeEventListener("session-ended", out);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  const show = (msg, type) => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };
  const go = destination => {
    const paths = { cars: "/", login: "/login", register: "/register", dashboard: "/trips", trips: "/trips", fleet: "/admin/fleet", trust: "/trust" };
    navigate(paths[destination] || destination);
  };
  const onAuth = d => {
    localStorage.setItem("access", d.access); localStorage.setItem("refresh", d.refresh);
    localStorage.setItem("user", JSON.stringify(d.user));
    setUser(d.user); show("Welcome, " + d.user.username + "!"); go("dashboard");
  };
  const logout = () => { clearSession(); go("cars"); };
  const signIn = <AuthPage mode="login" go={go} onAuth={onAuth} />;
  const dashboardProps = { user, go, toast: show, Fleet, ReviewModal, BookingMapModal };
  const tripsView = user ? <DashboardView {...dashboardProps} /> : signIn;
  const fleetView = user?.role === "renter" ? <DashboardView {...dashboardProps} /> : signIn;
  const trustView = user ? <TrustAndSafety /> : signIn;
  const view = <Routes>
    <Route path="/" element={<HomeDiscovery user={user} go={go} toast={show} locatePlace={locatePlace} currency={CURRENCY} />} />
    <Route path="/cars/:carId" element={<CarDetail user={user} onBooked={() => show("Booking request sent to the renter")} />} />
    <Route path="/login" element={<AuthPage mode="login" go={go} onAuth={onAuth} />} />
    <Route path="/register" element={<AuthPage mode="register" go={go} onAuth={onAuth} />} />
    <Route path="/trips" element={tripsView} />
    <Route path="/admin/fleet" element={fleetView} />
    <Route path="/bookings/:bookingId/handover" element={user ? <HandoverUnavailable /> : signIn} />
    <Route path="/trust" element={trustView} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;

  return (
    <><ToastCtx.Provider value={show}><RequestIndicator />
      <Navigation page={page} path={path} user={user} onNavigate={go} onLogout={logout} theme={theme} onToggleTheme={() => setTheme(value => value === "dark" ? "light" : "dark")} />
      <div className="wrap" style={{ paddingBottom: 20 }}>{view}</div><footer>DriveEasy · South Africa</footer>
      {toast && <div className={"toast " + (toast.type || "")}>{toast.msg}</div>}
    </ToastCtx.Provider></>
  );
}

export default App;
