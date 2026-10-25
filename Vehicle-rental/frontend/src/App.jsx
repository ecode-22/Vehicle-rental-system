import { useState, useEffect, useCallback, useContext, createContext } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { CarFront, Flag, MapPin, MapPinned, Play, Star, Wrench } from "lucide-react";
import { api, clearSession } from "./services/api.js";
import { locatePlace } from "./services/geocode.js";
import Modal from "./components/Modal.jsx";
import MapView from "./components/MapView.jsx";
import LocationInput from "./components/LocationInput.jsx";
import StatusBadge from "./components/StatusBadge.jsx";
import Navigation from "./components/Navigation.jsx";
import RequestIndicator from "./components/RequestIndicator.jsx";
import HomeDiscovery from "./pages/HomeDiscovery.jsx";
import CarDetail from "./pages/CarDetail.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import DashboardView from "./pages/DashboardView.jsx";
import TrustAndSafety from "./pages/TrustAndSafety.jsx";
import HandoverUnavailable from "./pages/HandoverUnavailable.jsx";

/* ================= CONFIG & API ================= */
const CURRENCY = "R";

const money = n => CURRENCY + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

/* ================= SHARED UI ================= */
const ToastCtx = createContext(() => {});
const useToast = () => useContext(ToastCtx);

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

const hasPoint = (latitude, longitude) => latitude != null && longitude != null;

function BookingMapModal({ booking, onClose }) {
  const [points, setPoints] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const car = booking.car_detail;
  useEffect(() => {
    let active = true;
    const stops = [
      { label: "Car location", color: "#f7c66b", text: car.location, point: hasPoint(car.latitude, car.longitude) ? [car.latitude, car.longitude] : null },
      { label: "Customer pick-up", color: "#48d3a3", text: booking.collection_location, point: hasPoint(booking.collection_latitude, booking.collection_longitude) ? [booking.collection_latitude, booking.collection_longitude] : null },
      { label: "Customer drop-off", color: "#f07b65", text: booking.dropoff_location, point: hasPoint(booking.dropoff_latitude, booking.dropoff_longitude) ? [booking.dropoff_latitude, booking.dropoff_longitude] : null }
    ];
    // Points picked from the suggestions are exact; anything typed by hand is looked up.
    Promise.all(stops.map(stop => stop.point || (stop.text ? locatePlace(stop.text) : null))).then(found => {
      if (active) { setPoints(stops.map((stop, index) => ({ ...stop, point: found[index] })).filter(stop => stop.point)); setLoaded(true); }
    });
    return () => { active = false; };
  }, [booking.id]);
  return (
    <Modal title={`${car.make} ${car.model} · Handover map`} onClose={onClose} className="handover-modal">
      <div className="handover-points three">
        <div><MapPin size={16} /><span><small>Car is at</small>{car.location || "—"}</span></div>
        <div><MapPin size={16} /><span><small>Customer pick-up</small>{booking.collection_location || "Not provided"}</span></div>
        <div><MapPinned size={16} /><span><small>Customer drop-off</small>{booking.dropoff_location || "Not provided"}</span></div>
      </div>
      {points.length > 0 ? <MapView center={points[0].point} markers={points.map((stop, index) => ({ id: index, position: stop.point, color: stop.color, popup: stop.label }))} className="handover-map" /> : <div className="empty">{loaded ? "We could not map these points." : "Loading map locations…"}</div>}
      <p className="map-footnote">Pins use the exact spot picked from the suggestions. Places typed by hand are approximate. Live vehicle tracking requires compatible GPS hardware and renter consent.</p>
    </Modal>
  );
}

/* ================= RENTER: FLEET ================= */
// The owner only says where the car is. Customers choose their own pick-up and drop-off when they book.
const blankCar = { make: "", model: "", year: new Date().getFullYear(), price_per_day: "", seats: 5, transmission: "manual", fuel: "petrol", location: "", latitude: null, longitude: null, image_url: "", description: "" };
const STATUS_LABEL = { active: "Active", booked: "Booked", paused: "Paused", removed: "Removed" };

function CarForm({ car, onClose, onSaved }) {
  const [f, setF] = useState(car || blankCar);
  const [phone, setPhone] = useState(car?.owner_contact?.phone || "");
  const [email, setEmail] = useState(car?.owner_contact?.email || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageFiles, setImageFiles] = useState([]);
  const [newPreviews, setNewPreviews] = useState([]);
  const oldPhotos = [...(car?.photos || []).map(photo => photo.image), car?.image, car?.image_url].filter(Boolean);
  const set = k => e => setF({ ...f, [k]: e.target.value });

  // Contact details live on the owner's profile and are shown on every ad
  useEffect(() => {
    let active = true;
    api("/auth/me/").then(me => { if (active) { setPhone(current => current || me.phone || ""); setEmail(me.email || ""); } }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const previewUrls = imageFiles.map(file => URL.createObjectURL(file));
    setNewPreviews(previewUrls);
    return () => previewUrls.forEach(URL.revokeObjectURL);
  }, [imageFiles]);

  const submit = async e => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      let { latitude, longitude } = f;
      if (latitude == null || longitude == null) {
        // The place was typed without picking a suggestion: try to find it so the car still lands on the map
        const found = await locatePlace(f.location);
        if (!found) throw new Error("We couldn't find that place on the map. Pick one of the suggestions under the location box.");
        [latitude, longitude] = found;
      }
      const body = new FormData();
      Object.entries({ make: f.make, model: f.model, year: +f.year, price_per_day: f.price_per_day, seats: +f.seats, transmission: f.transmission, fuel: f.fuel, location: f.location.trim(), latitude, longitude, image_url: f.image_url || "", description: f.description || "", contact_phone: phone.trim() }).forEach(([key, value]) => body.append(key, String(value)));
      imageFiles.forEach(file => body.append("photos", file));
      await api(car ? `/cars/${car.id}/` : "/cars/", { method: car ? "PATCH" : "POST", body });
      onSaved();
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  const footer = <>
    {err && <div className="err" role="alert">{err}</div>}
    <button className="btn" type="submit" form="car-form" style={{ width: "100%" }} disabled={busy}>{busy ? "Saving…" : "Save car"}</button>
  </>;

  return (
    <Modal title={car ? "Edit car" : "Add a car"} onClose={onClose} className="car-form-modal" footer={footer}>
      <form id="car-form" onSubmit={submit}>
        <div className="form-grid">
          <div><label htmlFor="car-make">Make</label><input id="car-make" required value={f.make} onChange={set("make")} /></div>
          <div><label htmlFor="car-model">Model</label><input id="car-model" required value={f.model} onChange={set("model")} /></div>
          <div><label htmlFor="car-year">Year</label><input id="car-year" required type="number" value={f.year} onChange={set("year")} /></div>
          <div><label htmlFor="car-price">Price / day ({CURRENCY})</label><input id="car-price" required type="number" step="0.01" min="0" value={f.price_per_day} onChange={set("price_per_day")} /></div>
          <div><label htmlFor="car-seats">Seats</label><input id="car-seats" type="number" min="1" value={f.seats} onChange={set("seats")} /></div>
          <div><label htmlFor="car-gearbox">Gearbox</label><select id="car-gearbox" value={f.transmission} onChange={set("transmission")}><option value="manual">Manual</option><option value="auto">Automatic</option></select></div>
          <div><label htmlFor="car-fuel">Fuel</label><select id="car-fuel" value={f.fuel} onChange={set("fuel")}><option value="petrol">Petrol</option><option value="diesel">Diesel</option><option value="electric">Electric</option><option value="hybrid">Hybrid</option></select></div>
        </div>

        <h3 className="form-section">Where is the car?</h3>
        <LocationInput id="car-location" label="Car location *" required value={f.location} placeholder="Town, suburb or address where the car is kept"
          onChange={(value, coordinates) => setF(current => ({ ...current, location: value, latitude: coordinates?.[0] ?? null, longitude: coordinates?.[1] ?? null }))} />
        <p className="field-hint">Pick a suggestion so the car shows in the right place on the map. Customers choose their own pick-up and drop-off places when they book.</p>

        <h3 className="form-section">Your contact details <span>shown on this ad</span></h3>
        <div className="form-grid two-up">
          <div><label htmlFor="car-phone">Phone *</label><input id="car-phone" required type="tel" autoComplete="tel" placeholder="082 123 4567" value={phone} onChange={e => setPhone(e.target.value)} /></div>
          <div><label htmlFor="car-email">Email (from your profile)</label><input id="car-email" type="email" value={email} placeholder="No email on your profile" disabled /></div>
        </div>
        <p className="field-hint">Signed-in customers see these on your ad. They are saved to your profile, so they apply to all your ads.</p>

        <h3 className="form-section">Photos and description</h3>
        <div className="image-upload gallery-upload">
          <div className="photo-previews">{oldPhotos.map((photo, index) => <div className="photo-preview" key={`old-${index}`}><img src={photo} alt={`Current car photo ${index + 1}`} /></div>)}{newPreviews.map((photo, index) => <div className="photo-preview" key={`new-${index}`}><img src={photo} alt={`New car photo ${index + 1}`} /></div>)}{!oldPhotos.length && !newPreviews.length && <div className="photo-placeholder"><CarFront size={26} /></div>}</div>
          <div className="image-upload-control"><input type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label={`Add car photos, up to ${Math.max(0, 10 - oldPhotos.length)} more`} onChange={e => {
            const files = Array.from(e.target.files || []);
            const total = oldPhotos.length + files.length;
            if (total > 10) { setErr("A car can have up to 10 photos."); e.target.value = ""; return; }
            if (files.some(file => file.size > 8 * 1024 * 1024)) { setErr("Each photo must be 8 MB or smaller."); e.target.value = ""; return; }
            setErr(""); setImageFiles(files);
          }} /><small>Up to {Math.max(0, 10 - oldPhotos.length)} more JPG, PNG or WebP photos · max 8 MB each</small></div>
        </div>
        <label htmlFor="car-image-url">Or use an image URL</label><input id="car-image-url" type="url" placeholder="https://…" value={f.image_url} onChange={set("image_url")} />
        <label htmlFor="car-description">Description</label><textarea id="car-description" rows="3" value={f.description} onChange={set("description")} />
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
      setCars(mine.filter(car => !car.is_archived)); setReports(ownReports);
    } catch (e) { setCars([]); toast(e.message, "err"); }
  }, []);
  useEffect(() => { load(); }, []);

  const name = c => `${c.make} ${c.model}`;
  const del = async c => {
    if (!confirm(`Remove ${name(c)} from your fleet?\n\nIt leaves the discovery board and can't be booked again. Past bookings are kept.`)) return;
    try { await api(`/cars/${c.id}/`, { method: "DELETE" }); toast("Car removed"); load(); onChange(); } catch (e) { toast(e.message, "err"); }
  };
  const pause = async c => {
    if (!confirm(`Pause ${name(c)} for maintenance?\n\nIt will leave the discovery board and can't be booked until you resume it. Bookings you have already confirmed are not cancelled.`)) return;
    try { await api(`/cars/${c.id}/pause/`, { method: "POST" }); toast(`${name(c)} is paused for maintenance`); load(); onChange(); } catch (e) { toast(e.message, "err"); }
  };
  const resume = async c => {
    try {
      const result = await api(`/cars/${c.id}/resume/`, { method: "POST" });
      toast(result.status === "booked" ? `${name(c)} resumed. It stays off the board while booked until ${result.booked_until}` : `${name(c)} is back on the discovery board`);
      load(); onChange();
    } catch (e) { toast(e.message, "err"); }
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
              <td>
                <StatusBadge status={c.status || "active"} label={STATUS_LABEL[c.status] || STATUS_LABEL.active} />
                {c.status === "booked" && <div className="sub status-note">until {c.booked_until}</div>}
                {c.status === "paused" && <div className="sub status-note">Hidden from customers</div>}
              </td>
              <td>{reports.find(report => report.car === c.id) ? <StatusBadge status={reports.find(report => report.car === c.id).status} /> : <span className="sub">None</span>}</td>
              <td><div className="fleet-actions">
                {c.status === "paused"
                  ? <button className="btn ok sm" onClick={() => resume(c)}><Play size={14} /> Resume</button>
                  : <button className="btn ghost sm" onClick={() => pause(c)} title="Take this car off the discovery board while it is being serviced"><Wrench size={14} /> Pause for maintenance</button>}
                <button className="icon-button table-icon" title="Report a vehicle problem" aria-label={`Report a problem with ${name(c)}`} onClick={() => setReportCar(c)}><Flag size={16} /></button>
                <button className="btn ghost sm" onClick={() => setEdit(c)}>Edit</button>
                <button className="btn bad sm" onClick={() => del(c)}>Delete</button>
              </div></td>
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
