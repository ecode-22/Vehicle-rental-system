import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CarFront, ChevronLeft, ChevronRight, Mail, MapPin, MessageCircle, Phone, ShieldCheck, Star, TriangleAlert } from "lucide-react";
import { api } from "../services/api.js";
import { telHref, whatsappHref } from "../services/contact.js";
import { readPickupSearch } from "../services/pickup.js";
import AvailabilityCalendar from "../components/AvailabilityCalendar.jsx";
import LocationInput from "../components/LocationInput.jsx";
import MapView from "../components/MapView.jsx";
import SkeletonLoader from "../components/SkeletonLoader.jsx";

const money = value => `R${Number(value || 0).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}`;
const longDate = value => new Date(`${value}T00:00:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function CarDetail({ user, onBooked }) {
  const { carId } = useParams();
  const navigate = useNavigate();
  const [car, setCar] = useState(null);
  const [error, setError] = useState("");
  const [photosIndex, setPhotosIndex] = useState(0);
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [blockedDates, setBlockedDates] = useState([]);
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState("");
  // The customer decides where they collect and return the car. A place searched on the home page is suggested.
  const [pickup, setPickup] = useState(() => { const saved = readPickupSearch(); return { text: saved?.label || "", coords: saved?.coordinates || null }; });
  const [dropoff, setDropoff] = useState({ text: "", coords: null });
  const [sameReturn, setSameReturn] = useState(true);

  const photos = car ? [...(car.photos || []).map(photo => photo.image), car.image, car.image_url].filter(Boolean) : [];
  const days = Math.max(1, Math.round((new Date(`${endDate}T00:00:00`) - new Date(`${startDate}T00:00:00`)) / 864e5) + 1);

  useEffect(() => {
    let active = true;
    setCar(null);
    setError("");
    setPhotosIndex(0);
    api(`/cars/${carId}/`) // signed-in users also get the owner's contact details
      .then(result => { if (active) setCar(result); })
      .catch(() => { if (active) setError("This car isn't available. It may have been removed or is no longer listed."); });
    return () => { active = false; };
  }, [carId]);

  useEffect(() => {
    if (!car) return undefined;
    let active = true;
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
    return () => { active = false; };
  }, [car]);

  const selectDate = date => {
    if (startDate === endDate || date < startDate) { setStartDate(date); setEndDate(date); }
    else setEndDate(date);
  };

  const submitBooking = async event => {
    event.preventDefault();
    setRequestError("");
    setBusy(true);
    try {
      const returnTo = sameReturn ? pickup : dropoff;
      await api("/bookings/", { method: "POST", body: {
        car: car.id,
        start_date: startDate,
        end_date: endDate,
        collection_location: pickup.text.trim(),
        collection_latitude: pickup.coords?.[0] ?? null,
        collection_longitude: pickup.coords?.[1] ?? null,
        dropoff_location: returnTo.text.trim(),
        dropoff_latitude: returnTo.coords?.[0] ?? null,
        dropoff_longitude: returnTo.coords?.[1] ?? null,
      } });
      onBooked();
      navigate("/trips");
    } catch (reason) {
      setRequestError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <main className="page-state"><span className="eyebrow">VEHICLE LISTING</span><h1>Vehicle unavailable</h1><p className="sub">{error}</p><button className="btn" onClick={() => navigate("/")}>Back to discovery</button></main>;
  if (!car) return <main className="page-state"><SkeletonLoader count={1} /></main>;

  const hasPoint = car.latitude != null && car.longitude != null;
  const contact = car.owner_contact;
  const unavailable = car.status === "paused" || car.status === "booked";
  const unavailableText = car.status === "paused"
    ? "This car is paused for maintenance right now, so it can't be booked."
    : car.status === "booked" ? `This car is already booked until ${longDate(car.booked_until)}.` : "";

  return (
    <main className="car-detail-page">
      <button className="link car-back-link" onClick={() => navigate(-1)}>← Back to discovery</button>
      <header className="car-detail-heading">
        <div><span className="eyebrow">{car.location || "SOUTH AFRICA"}</span><h1>{car.year} {car.make} {car.model}</h1></div>
        <div className="car-rating"><Star size={15} fill={car.rating_count ? "currentColor" : "none"} /><b>{car.rating_count ? Number(car.average_rating).toFixed(1) : "New"}</b><span>{car.rating_count ? `(${car.rating_count} reviews)` : "No reviews yet"}</span></div>
      </header>
      <div className="car-detail-layout">
        <div className="car-detail-main">
          <section className="vehicle-gallery" aria-label="Car photos">
            <div className="gallery-main">
              {photos.length ? <img src={photos[photosIndex]} alt={`${car.year} ${car.make} ${car.model}`} /> : <CarFront size={54} />}
              {photos.length > 1 && <><button className="gallery-arrow previous" aria-label="Previous photo" onClick={() => setPhotosIndex((photosIndex - 1 + photos.length) % photos.length)}><ChevronLeft size={20} /></button><button className="gallery-arrow next" aria-label="Next photo" onClick={() => setPhotosIndex((photosIndex + 1) % photos.length)}><ChevronRight size={20} /></button><span className="gallery-count">{photosIndex + 1} / {photos.length}</span></>}
            </div>
            {photos.length > 1 && <div className="gallery-thumbnails">{photos.map((photo, index) => <button type="button" key={`${photo}-${index}`} className={index === photosIndex ? "active" : ""} onClick={() => setPhotosIndex(index)} aria-label={`View photo ${index + 1}`}><img src={photo} alt="" /></button>)}</div>}
          </section>
          <section className="car-detail-section">
            <div className="car-specs"><span>{car.seats} seats</span><span>{car.transmission}</span><span>{car.fuel}</span></div>
            <h2>About this car</h2>
            <p>{car.description || "A well-presented car, ready for your next trip."}</p>
            <p className="owner-trust"><ShieldCheck size={17} /> Listed by {car.owner_name} <span>·</span> Cancellation terms are confirmed with the renter</p>
          </section>
          <section className="car-detail-section">
            <h2>Where the car is</h2>
            <div className="handover-points single"><div><MapPin size={16} /><span><small>Car location</small>{car.location || "Location on request"}</span></div></div>
            {hasPoint && <MapView center={[car.latitude, car.longitude]} className="detail-map" markers={[{ id: car.id, position: [car.latitude, car.longitude], color: "#f07b65", popup: <><b>{car.year} {car.make} {car.model}</b><br />{car.location}</> }]} />}
            <p className="map-footnote">You choose where to collect and return the car when you request it. Pins show the place the owner gave, not an exact address.</p>
          </section>
          <section className="car-detail-section">
            <h2>Contact the owner</h2>
            {contact ? (
              <div className="contact-card">
                <b>{contact.name}</b>
                <div className="contact-links">
                  {contact.phone && <a className="btn ghost sm" href={telHref(contact.phone)}><Phone size={14} /> {contact.phone}</a>}
                  {contact.phone && whatsappHref(contact.phone) && <a className="btn ghost sm" href={whatsappHref(contact.phone)} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp</a>}
                  {contact.email && <a className="btn ghost sm" href={`mailto:${contact.email}`}><Mail size={14} /> {contact.email}</a>}
                  {!contact.phone && !contact.email && <span className="sub" style={{ margin: 0 }}>This owner hasn't added contact details yet.</span>}
                </div>
              </div>
            ) : <p className="sub">Log in to see how to contact {car.owner_name}.</p>}
          </section>
          <section className="car-detail-section car-calendar-section">
            <h2>Availability</h2>
            <p className="sub">Unavailable dates are marked and cannot be selected.</p>
            <AvailabilityCalendar blockedDates={blockedDates} startDate={startDate} endDate={endDate} onSelect={selectDate} />
          </section>
        </div>
        <aside className="car-booking-sticky">
          <form className="car-booking-card" onSubmit={submitBooking}>
            <div className="detail-price">{money(car.price_per_day)} <span>/ day</span></div>
            <p className="sub">Request this car from its renter</p>
            {unavailable && <div className="car-unavailable" role="status"><TriangleAlert size={15} aria-hidden="true" /><span>{unavailableText}</span></div>}
            <fieldset className="booking-fields" disabled={unavailable || busy}>
              <label htmlFor="car-pickup">Pick-up date</label><input id="car-pickup" type="date" min={today()} value={startDate} onChange={event => { setStartDate(event.target.value); if (event.target.value > endDate) setEndDate(event.target.value); }} required />
              <label htmlFor="car-return">Return date</label><input id="car-return" type="date" min={startDate} value={endDate} onChange={event => setEndDate(event.target.value)} required />
              <LocationInput id="trip-pickup" className="trip-place" label="Where will you collect it? *" required value={pickup.text} placeholder="Your pick-up place" onChange={(text, coords) => setPickup({ text, coords })} />
              <label className="check-row"><input type="checkbox" checked={sameReturn} onChange={event => setSameReturn(event.target.checked)} /> I'll return it to the same place</label>
              {!sameReturn && <LocationInput id="trip-dropoff" className="trip-place" label="Where will you return it? *" required value={dropoff.text} placeholder="Your drop-off place" onChange={(text, coords) => setDropoff({ text, coords })} />}
            </fieldset>
            <div className="booking-total"><span>{money(car.price_per_day)} × {days} day{days === 1 ? "" : "s"}</span><b>{money(days * Number(car.price_per_day))}</b></div>
            {requestError && <div className="err">{requestError}</div>}
            {user?.role === "customer" ? <button className="btn car-book-button" disabled={busy || unavailable || blockedDates.some(date => date >= startDate && date <= endDate)}>{busy ? "Sending request…" : unavailable ? "Not available to book" : "Request to book"}</button> : <button type="button" className="btn car-book-button" onClick={() => navigate(user ? "/" : "/login")}>{user ? "Owners cannot book cars" : "Log in to request"}</button>}
            <p className="booking-assurance">No payment is taken now. The renter must approve your request.</p>
          </form>
        </aside>
      </div>
    </main>
  );
}
