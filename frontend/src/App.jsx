import { useState, useEffect, useCallback, useContext, createContext } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { BadgeCheck, CalendarDays, CarFront, CircleDollarSign, Clock3, Flag, MapPin, MapPinned, Plus, ShieldCheck, Star, ChevronLeft, ChevronRight } from "lucide-react";
import { api, clearSession } from "./services/api.js";
import Modal from "./components/Modal.jsx";
import MapView from "./components/MapView.jsx";
import StatusBadge from "./components/StatusBadge.jsx";
import Navigation from "./components/Navigation.jsx";
import RequestIndicator from "./components/RequestIndicator.jsx";
import HomeDiscovery from "./pages/HomeDiscovery.jsx";
import CarDetail from "./pages/CarDetail.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import UserTrips from "./pages/UserTrips.jsx";
import FleetAdminDashboard from "./pages/FleetAdminDashboard.jsx";
import TrustAndSafety from "./pages/TrustAndSafety.jsx";
import CheckoutWizard from "./pages/CheckoutWizard.jsx";
import AvailabilityCalendar from "./components/AvailabilityCalendar.jsx";
import "leaflet/dist/leaflet.css";

/* ================= CONFIG & API ================= */
const CURRENCY = "R";
const placeCache = new Map();

const money = n => CURRENCY + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const todayStr = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

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

/* ================= BROWSE CARS (user side) ================= */
function CarDetailModal({ car, onClose, onDone }) {
  const [s, setS] = useState(todayStr());
  const [e, setE] = useState(todayStr());
  const collectionPoint = car.collection_location || car.location;
  const dropoffPoint = car.dropoff_location || car.location;
  const [collection, setCollection] = useState(collectionPoint);
  const [dropoff, setDropoff] = useState(dropoffPoint);
  const [reviews, setReviews] = useState([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [mapPoints, setMapPoints] = useState([]);
  const [blockedDates, setBlockedDates] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(0);
  const days = Math.max(0, Math.round((new Date(e) - new Date(s)) / 864e5) + 1);
  const photos = [...(car.photos || []).map(photo => photo.image), car.image, car.image_url].filter(Boolean);

  useEffect(() => {
    let active = true;
    api(`/cars/${car.id}/reviews/`, { auth: false }).then(data => { if (active) setReviews(data); }).catch(() => {});
    api(`/cars/${car.id}/availability/`, { auth: false }).then(ranges => {
      if (!active) return;
      const dates = ranges.flatMap(({ start_date, end_date }) => {
        const current = new Date(`${start_date}T00:00:00`);
        const last = new Date(`${end_date}T00:00:00`);
        const blocked = [];
        while (current <= last) {
          blocked.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`);
          current.setDate(current.getDate() + 1);
        }
        return blocked;
      });
      setBlockedDates(dates);
    }).catch(() => {});
    const collectionCoordinates = car.latitude != null && car.longitude != null ? [car.latitude, car.longitude] : null;
    Promise.all([collectionCoordinates || locatePlace(collectionPoint), locatePlace(dropoffPoint)]).then(points => {
      if (active) setMapPoints(points.filter(Boolean));
    });
    return () => { active = false; };
  }, [car.id]);

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      await api("/bookings/", { method: "POST", body: { car: car.id, start_date: s, end_date: e, collection_location: collection, dropoff_location: dropoff } });
      onDone();
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  const advanceCheckout = event => {
    event.preventDefault();
    setErr("");
    if (checkoutStep === 0 && (!s || !e || !days)) return setErr("Choose valid pick-up and return dates.");
    if (checkoutStep === 1 && (!collection || !dropoff)) return setErr("Choose both handover points.");
    if (checkoutStep < 2) return setCheckoutStep(checkoutStep + 1);
    submit();
  };

  return (
    <Modal title={`${car.year} ${car.make} ${car.model}`} onClose={onClose} className="vehicle-modal">
      <div className="vehicle-detail">
        <section className="vehicle-gallery" aria-label="Car photos">
          <div className="gallery-main">
            {photos.length ? <img src={photos[galleryIndex]} alt={`${car.year} ${car.make} ${car.model}, photo ${galleryIndex + 1}`} /> : <CarFront size={48} />}
            {photos.length > 1 && <><button className="gallery-arrow previous" aria-label="Previous photo" onClick={() => setGalleryIndex((galleryIndex - 1 + photos.length) % photos.length)}><ChevronLeft size={20} /></button><button className="gallery-arrow next" aria-label="Next photo" onClick={() => setGalleryIndex((galleryIndex + 1) % photos.length)}><ChevronRight size={20} /></button><span className="gallery-count">{galleryIndex + 1} / {photos.length}</span></>}
          </div>
          {photos.length > 1 && <div className="gallery-thumbnails">{photos.map((photo, index) => <button type="button" key={`${photo}-${index}`} className={index === galleryIndex ? "active" : ""} onClick={() => setGalleryIndex(index)} aria-label={`View photo ${index + 1}`}><img src={photo} alt="" /></button>)}</div>}
        </section>
        <div className="vehicle-facts">
          <div className="detail-price">{money(car.price_per_day)} <span>/ day</span></div>
          <p className="sub">Listed by {car.owner_name} · {car.seats} seats · {car.transmission} · {car.fuel}</p>
          <p>{car.description || "A well-presented car, ready for your next trip."}</p>
          <div className="car-rating"><Star size={15} fill={car.rating_count ? "currentColor" : "none"} /><b>{car.rating_count ? Number(car.average_rating).toFixed(1) : "New"}</b><span>{car.rating_count ? `(${car.rating_count} verified rental review${car.rating_count === 1 ? "" : "s"})` : "No reviews yet"}</span></div>
        </div>
        <section className="handover-map-section">
          <div className="section-heading"><div><span className="eyebrow">HANDOVER POINTS</span><h2>Collection and return</h2></div></div>
          <div className="handover-points"><div><MapPin size={16} /><span><small>Collection</small>{collectionPoint}</span></div><div><MapPinned size={16} /><span><small>Drop-off</small>{dropoffPoint}</span></div></div>
          {mapPoints.length > 0 && <MapView center={mapPoints[0]} markers={mapPoints.map((point, index) => ({ id: index, position: point, color: index ? "#f07b65" : "#48d3a3", popup: `${index ? "Drop-off" : "Collection"}: ${index ? dropoffPoint : collectionPoint}` }))} className="handover-map" />}
          <p className="map-footnote">Map pins are approximate points for the selected towns or addresses, not live vehicle tracking.</p>
        </section>
        <section className="prebook-reviews">
          <div className="section-heading"><div><span className="eyebrow">RENTER REVIEWS</span><h2>From previous customers</h2></div><span>{reviews.length} reviews</span></div>
          {reviews.length ? <div className="review-list">{reviews.map(review => <article className="review-item" key={review.id}><div className="review-meta"><b>{review.reviewer_name}</b><span><Star size={13} fill="currentColor" /> {review.score}.0</span></div>{review.comment && <p>{review.comment}</p>}</article>)}</div> : <p className="sub">This car has not received a review yet.</p>}
        </section>
        <form className="booking-panel" onSubmit={advanceCheckout}>
          <div className="section-heading"><div><span className="eyebrow">YOUR RESERVATION</span><h2>{["Choose your dates", "Set handover points", "Review your request"][checkoutStep]}</h2></div></div>
          <CheckoutWizard steps={["Dates", "Handover", "Review"]} activeStep={checkoutStep} onStepChange={setCheckoutStep}>
            {checkoutStep === 0 && <div className="two">
              <div><label htmlFor="booking-start">Pick-up date</label><input id="booking-start" required type="date" min={todayStr()} value={s} onChange={x => setS(x.target.value)} /></div>
              <div><label htmlFor="booking-end">Return date</label><input id="booking-end" required type="date" min={s} value={e} onChange={x => setE(x.target.value)} /></div>
              <AvailabilityCalendar blockedDates={blockedDates} startDate={s} endDate={e} onSelect={date => {
                if (s === e || date < s) { setS(date); setE(date); }
                else setE(date);
              }} />
            </div>}
            {checkoutStep === 1 && <div className="two">
              <div><label>Collection point</label><select required value={collection} onChange={x => setCollection(x.target.value)}><option value={collectionPoint}>{collectionPoint}</option></select></div>
              <div><label>Drop-off point</label><select required value={dropoff} onChange={x => setDropoff(x.target.value)}><option value={dropoffPoint}>{dropoffPoint}</option></select></div>
            </div>}
            {checkoutStep === 2 && <div className="checkout-summary"><b>{car.year} {car.make} {car.model}</b><span>{s} to {e} · {days} day{days === 1 ? "" : "s"}</span><span>Collection: {collection}</span><span>Return: {dropoff}</span><p>Payment and optional protection are not part of this request. The renter reviews your booking before it is confirmed.</p></div>}
          </CheckoutWizard>
          <div className="booking-total"><span>{money(car.price_per_day)} × {days} day{days === 1 ? "" : "s"}</span><b>{money(days * car.price_per_day)}</b></div>
          {err && <div className="err">{err}</div>}
          <div className="checkout-actions">{checkoutStep > 0 && <button type="button" className="btn ghost" onClick={() => setCheckoutStep(checkoutStep - 1)}>Back</button>}<button className="btn" style={{ flex: 1, marginTop: 8 }} disabled={busy || !days}>{busy ? "Sending request…" : checkoutStep === 2 ? "Request this car" : "Continue"}</button></div>
          <p className="booking-assurance">Your booking is confirmed by the renter before it becomes final.</p>
        </form>
      </div>
    </Modal>
  );
}

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

/* ================= DASHBOARD (both roles) ================= */
function BookingsTable({ bookings, isRenter, act, reviews, backgroundChecks, onReview, onRequestCheck, onRespondCheck, onMap }) {
  if (!bookings.length) return <div className="card empty">{isRenter ? "No booking requests yet." : "You haven't booked anything yet."}</div>;
  return (
    <div className="card tbl"><table>
      <thead><tr><th>Car</th>{isRenter && <th>Customer</th>}<th>Dates</th><th>Handover</th><th>Total</th><th>Status</th><th></th></tr></thead>
      <tbody>{bookings.map(b => (
        <tr key={b.id}>
          <td><b>{b.car_detail.make} {b.car_detail.model}</b></td>
          {isRenter && <td>{b.customer_name}</td>}
          <td>{b.start_date} → {b.end_date}</td>
          <td className="booking-handover"><span><b>From</b> {b.collection_location}</span><span><b>To</b> {b.dropoff_location}</span><button className="link map-link" onClick={() => onMap(b)}><MapPinned size={14} /> Map</button></td>
          <td>{money(b.total_price)}</td><td><StatusBadge status={b.status} /></td>
          <td className="booking-actions">
            {isRenter && b.status === "pending" && <><button className="btn ok sm" onClick={() => act(b.id, "confirm")}>Confirm</button>{" "}<button className="btn bad sm" onClick={() => act(b.id, "reject")}>Reject</button></>}
            {isRenter && b.status === "confirmed" && <button className="btn ok sm" onClick={() => act(b.id, "complete")}>Mark complete</button>}
            {isRenter && ["pending", "confirmed"].includes(b.status) && (() => {
              const check = backgroundChecks.find(item => item.booking_id === b.id);
              return check ? <span className={`check-status ${check.status}`}><ShieldCheck size={14} /> Consent {check.status}</span> : <button className="btn ghost sm" onClick={() => onRequestCheck(b)}><ShieldCheck size={14} /> Request consent</button>;
            })()}
            {!isRenter && ["pending", "confirmed"].includes(b.status) && <button className="btn ghost sm" onClick={() => act(b.id, "cancel")}>Cancel</button>}
            {!isRenter && backgroundChecks.filter(item => item.booking_id === b.id && item.status === "requested").map(item => <span className="consent-actions" key={item.id}><button className="btn ok sm" onClick={() => onRespondCheck(item.id, "consented")}>Consent</button>{" "}<button className="btn ghost sm" onClick={() => onRespondCheck(item.id, "declined")}>Decline</button></span>)}
            {b.status === "completed" && (() => {
              const alreadyReviewed = reviews.some(item => item.booking_id === b.id && (isRenter ? item.target_user === b.customer : item.target_car === b.car));
              return alreadyReviewed ? <span className="check-status completed"><Star size={14} /> Rated</span> : <button className="btn ghost sm" onClick={() => onReview(b)}><Star size={14} /> {isRenter ? "Rate customer" : "Rate car"}</button>;
            })()}
          </td>
        </tr>))}</tbody>
    </table></div>
  );
}

function Dashboard({ user, go }) {
  const location = useLocation();
  const toast = useToast();
  const isRenter = user.role === "renter";
  const [d, setD] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [backgroundChecks, setBackgroundChecks] = useState([]);
  const [tab, setTab] = useState(location.pathname === "/admin/fleet" ? "fleet" : "bookings");
  const [ratingBooking, setRatingBooking] = useState(null);
  const [mapBooking, setMapBooking] = useState(null);

  const load = useCallback(async () => {
    try {
      const [a, b, ownReviews, checks] = await Promise.all([api("/dashboard/"), api("/bookings/"), api("/reviews/"), api("/background-checks/")]);
      setD(a); setBookings(b); setReviews(ownReviews); setBackgroundChecks(checks);
    } catch (e) { toast(e.message, "err"); }
  }, []);
  useEffect(() => { load(); }, []);

  useEffect(() => {
    setTab(location.pathname === "/admin/fleet" ? "fleet" : "bookings");
    const handoverId = location.pathname.match(/^\/bookings\/(\d+)\/handover$/)?.[1];
    setMapBooking(handoverId ? bookings.find(booking => String(booking.id) === handoverId) || null : null);
  }, [location.pathname, bookings]);

  const act = async (id, a) => {
    try { await api(`/bookings/${id}/${a}/`, { method: "POST" }); toast(`Booking ${a}${a.endsWith("e") ? "d" : "ed"}`); load(); }
    catch (e) { toast(e.message, "err"); }
  };
  const requestCheck = async booking => {
    try {
      await api("/background-checks/", { method: "POST", body: { booking_id: booking.id } });
      toast("Consent request sent to the customer"); load();
    } catch (e) { toast(e.message, "err"); }
  };
  const respondCheck = async (id, decision) => {
    try {
      await api(`/background-checks/${id}/respond/`, { method: "POST", body: { decision } });
      toast(decision === "consented" ? "Consent recorded" : "Request declined"); load();
    } catch (e) { toast(e.message, "err"); }
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
          {isRenter && d?.rating_count > 0 && <div className="owner-rating"><Star size={15} fill="currentColor" /> {Number(d.average_rating).toFixed(1)} <span>from {d.rating_count} customer rating{d.rating_count === 1 ? "" : "s"}</span></div>}
        </div>
        {isRenter && <button className="btn dashboard-add" onClick={() => go("fleet")}><Plus size={17} /> Add a vehicle</button>}
      </header>
      <section className="stats" aria-label="Account overview">
        {stats.map(({ label, value, icon: Icon, tone }) => <article className="card stat" key={label}>
          <span className={`stat-icon ${tone}`}><Icon size={19} /></span><span className="stat-label">{label}</span><b>{value}</b>
        </article>)}
      </section>
      {isRenter && (
        <div className="tabs dashboard-tabs" role="tablist" aria-label="Renter workspace">
          <button role="tab" aria-selected={tab === "bookings"} className={tab === "bookings" ? "active" : ""} onClick={() => go("dashboard")}><CalendarDays size={17} /> Booking requests <span>{bookings.filter(b => b.status === "pending").length}</span></button>
          <button role="tab" aria-selected={tab === "fleet"} className={tab === "fleet" ? "active" : ""} onClick={() => go("fleet")}><CarFront size={17} /> My fleet</button>
        </div>
      )}
      {(!isRenter || tab === "bookings") ? (
        <section className="dashboard-section">
          <div className="section-heading"><div><span className="eyebrow">{isRenter ? "STAY ON TOP OF EVERY REQUEST" : "YOUR RESERVATIONS"}</span><h2>{isRenter ? "Booking requests" : "My bookings"}</h2></div><span>{bookings.length} total</span></div>
          <BookingsTable bookings={bookings} isRenter={isRenter} act={act} reviews={reviews} backgroundChecks={backgroundChecks} onReview={setRatingBooking} onRequestCheck={requestCheck} onRespondCheck={respondCheck} onMap={booking => go(`/bookings/${booking.id}/handover`)} />
          {isRenter && <p className="workflow-note"><ShieldCheck size={14} /> Screening consent is recorded here; an actual background check requires a connected screening provider.</p>}
        </section>
      ) : <Fleet onChange={load} />}
      {ratingBooking && <ReviewModal booking={ratingBooking} user={user} onClose={() => setRatingBooking(null)} onDone={() => { setRatingBooking(null); toast("Rating submitted"); load(); }} />}
      {mapBooking && <BookingMapModal booking={mapBooking} onClose={() => go("dashboard")} />}
    </main>
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
  const tripsView = user ? <UserTrips DashboardView={Dashboard} user={user} go={go} /> : signIn;
  const fleetView = user?.role === "renter" ? <FleetAdminDashboard DashboardView={Dashboard} user={user} go={go} /> : signIn;
  const trustView = user ? <TrustAndSafety /> : signIn;
  const view = <Routes>
    <Route path="/" element={<HomeDiscovery user={user} go={go} toast={show} locatePlace={locatePlace} currency={CURRENCY} />} />
    <Route path="/cars/:carId" element={<CarDetail DetailView={CarDetailModal} onBooked={() => show("Booking request sent to the renter")} />} />
    <Route path="/login" element={<AuthPage mode="login" go={go} onAuth={onAuth} />} />
    <Route path="/register" element={<AuthPage mode="register" go={go} onAuth={onAuth} />} />
    <Route path="/trips" element={tripsView} />
    <Route path="/admin/fleet" element={fleetView} />
    <Route path="/bookings/:bookingId/handover" element={tripsView} />
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
