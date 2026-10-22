import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { BadgeCheck, CalendarDays, CarFront, CircleDollarSign, Clock3, MapPinned, Plus, ShieldCheck, Star } from "lucide-react";
import { api } from "../services/api.js";
import StatusBadge from "../components/StatusBadge.jsx";

const money = value => `R${Number(value || 0).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}`;

function BookingsTable({ bookings, isRenter, act, reviews, backgroundChecks, onReview, onRequestCheck, onRespondCheck, onMap }) {
  if (!bookings.length) return <div className="card empty">{isRenter ? "No booking requests yet." : "You haven't booked anything yet."}</div>;
  return (
    <div className="card tbl"><table>
      <thead><tr><th>Car</th>{isRenter && <th>Customer</th>}<th>Dates</th><th>Handover</th><th>Total</th><th>Status</th><th></th></tr></thead>
      <tbody>{bookings.map(booking => (
        <tr key={booking.id}>
          <td><b>{booking.car_detail.make} {booking.car_detail.model}</b></td>
          {isRenter && <td>{booking.customer_name}</td>}
          <td>{booking.start_date} → {booking.end_date}</td>
          <td className="booking-handover"><span><b>From</b> {booking.collection_location}</span><span><b>To</b> {booking.dropoff_location}</span><button className="link map-link" onClick={() => onMap(booking)}><MapPinned size={14} /> Map</button></td>
          <td>{money(booking.total_price)}</td><td><StatusBadge status={booking.status} /></td>
          <td className="booking-actions">
            {isRenter && booking.status === "pending" && <><button className="btn ok sm" onClick={() => act(booking.id, "confirm")}>Confirm</button>{" "}<button className="btn bad sm" onClick={() => act(booking.id, "reject")}>Reject</button></>}
            {isRenter && booking.status === "confirmed" && <button className="btn ok sm" onClick={() => act(booking.id, "complete")}>Mark complete</button>}
            {isRenter && ["pending", "confirmed"].includes(booking.status) && (() => {
              const check = backgroundChecks.find(item => item.booking_id === booking.id);
              return check ? <span className={`check-status ${check.status}`}><ShieldCheck size={14} /> Consent {check.status}</span> : <button className="btn ghost sm" onClick={() => onRequestCheck(booking)}><ShieldCheck size={14} /> Request consent</button>;
            })()}
            {!isRenter && ["pending", "confirmed"].includes(booking.status) && <button className="btn ghost sm" onClick={() => act(booking.id, "cancel")}>Cancel</button>}
            {!isRenter && backgroundChecks.filter(item => item.booking_id === booking.id && item.status === "requested").map(item => <span className="consent-actions" key={item.id}><button className="btn ok sm" onClick={() => onRespondCheck(item.id, "consented")}>Consent</button>{" "}<button className="btn ghost sm" onClick={() => onRespondCheck(item.id, "declined")}>Decline</button></span>)}
            {booking.status === "completed" && (() => {
              const alreadyReviewed = reviews.some(item => item.booking_id === booking.id && (isRenter ? item.target_user === booking.customer : item.target_car === booking.car));
              return alreadyReviewed ? <span className="check-status completed"><Star size={14} /> Rated</span> : <button className="btn ghost sm" onClick={() => onReview(booking)}><Star size={14} /> {isRenter ? "Rate customer" : "Rate car"}</button>;
            })()}
          </td>
        </tr>))}</tbody>
    </table></div>
  );
}

export default function DashboardView({ user, go, toast, Fleet, ReviewModal, BookingMapModal }) {
  const location = useLocation();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const isRenter = user.role === "renter";
  const [dashboard, setDashboard] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [backgroundChecks, setBackgroundChecks] = useState([]);
  const [tab, setTab] = useState(location.pathname === "/admin/fleet" ? "fleet" : "bookings");
  const [ratingBooking, setRatingBooking] = useState(null);
  const [mapBooking, setMapBooking] = useState(null);

  const load = useCallback(async () => {
    try {
      const [stats, bookingRows, reviewRows, checks] = await Promise.all([api("/dashboard/"), api("/bookings/"), api("/reviews/"), api("/background-checks/")]);
      setDashboard(stats);
      setBookings(bookingRows);
      setReviews(reviewRows);
      setBackgroundChecks(checks);
    } catch (error) { toastRef.current(error.message, "err"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setTab(location.pathname === "/admin/fleet" ? "fleet" : "bookings");
    setMapBooking(null);
  }, [location.pathname]);

  const act = async (id, action) => {
    try { await api(`/bookings/${id}/${action}/`, { method: "POST" }); toast(`Booking ${action}${action.endsWith("e") ? "d" : "ed"}`); load(); }
    catch (error) { toast(error.message, "err"); }
  };
  const requestCheck = async booking => {
    try { await api("/background-checks/", { method: "POST", body: { booking_id: booking.id } }); toast("Consent request sent to the customer"); load(); }
    catch (error) { toast(error.message, "err"); }
  };
  const respondCheck = async (id, decision) => {
    try { await api(`/background-checks/${id}/respond/`, { method: "POST", body: { decision } }); toast(decision === "consented" ? "Consent recorded" : "Request declined"); load(); }
    catch (error) { toast(error.message, "err"); }
  };

  const stats = !dashboard ? [] : isRenter
    ? [
      { label: "Vehicles listed", value: dashboard.total_cars, icon: CarFront, tone: "coral" },
      { label: "Needs your attention", value: dashboard.pending_requests, icon: Clock3, tone: "gold" },
      { label: "Confirmed rentals", value: dashboard.confirmed_bookings, icon: BadgeCheck, tone: "green" },
      { label: "Rental revenue", value: money(dashboard.revenue), icon: CircleDollarSign, tone: "blue" }
    ]
    : [
      { label: "Total bookings", value: dashboard.total_bookings, icon: CalendarDays, tone: "coral" },
      { label: "Pending", value: dashboard.pending, icon: Clock3, tone: "gold" },
      { label: "Confirmed", value: dashboard.confirmed, icon: BadgeCheck, tone: "green" },
      { label: "Total spent", value: money(dashboard.total_spent), icon: CircleDollarSign, tone: "blue" }
    ];

  return (
    <main className="dashboard-page">
      <header className="dashboard-hero">
        <div>
          <span className="eyebrow">{isRenter ? "OWNER WORKSPACE" : "YOUR DRIVEEASY ACCOUNT"}</span>
          <h1>{isRenter ? "Your rental business, in view." : "Your journeys, in one place."}</h1>
          <p>{isRenter ? `Welcome back, ${user.username}. Keep your fleet moving.` : `Welcome back, ${user.username}. Review your rental activity.`}</p>
          {isRenter && dashboard?.rating_count > 0 && <div className="owner-rating"><Star size={15} fill="currentColor" /> {Number(dashboard.average_rating).toFixed(1)} <span>from {dashboard.rating_count} customer rating{dashboard.rating_count === 1 ? "" : "s"}</span></div>}
        </div>
        {isRenter && <button className="btn dashboard-add" onClick={() => go("fleet")}><Plus size={17} /> Add a vehicle</button>}
      </header>
      <section className="stats" aria-label="Account overview">
        {stats.map(({ label, value, icon: Icon, tone }) => <article className="card stat" key={label}>
          <span className={`stat-icon ${tone}`}><Icon size={19} /></span><span className="stat-label">{label}</span><b>{value}</b>
        </article>)}
      </section>
      {isRenter && <div className="tabs dashboard-tabs" role="tablist" aria-label="Renter workspace">
        <button role="tab" aria-selected={tab === "bookings"} className={tab === "bookings" ? "active" : ""} onClick={() => go("dashboard")}><CalendarDays size={17} /> Booking requests <span>{bookings.filter(booking => booking.status === "pending").length}</span></button>
        <button role="tab" aria-selected={tab === "fleet"} className={tab === "fleet" ? "active" : ""} onClick={() => go("fleet")}><CarFront size={17} /> My fleet</button>
      </div>}
      {(!isRenter || tab === "bookings") ? <section className="dashboard-section">
        <div className="section-heading"><div><span className="eyebrow">{isRenter ? "STAY ON TOP OF EVERY REQUEST" : "YOUR RESERVATIONS"}</span><h2>{isRenter ? "Booking requests" : "My bookings"}</h2></div><span>{bookings.length} total</span></div>
        <BookingsTable bookings={bookings} isRenter={isRenter} act={act} reviews={reviews} backgroundChecks={backgroundChecks} onReview={setRatingBooking} onRequestCheck={requestCheck} onRespondCheck={respondCheck} onMap={setMapBooking} />
        {isRenter && <p className="workflow-note"><ShieldCheck size={14} /> Screening consent is recorded here; an actual background check requires a connected screening provider.</p>}
      </section> : <Fleet onChange={load} />}
      {ratingBooking && <ReviewModal booking={ratingBooking} user={user} onClose={() => setRatingBooking(null)} onDone={() => { setRatingBooking(null); toast("Rating submitted"); load(); }} />}
      {mapBooking && <BookingMapModal booking={mapBooking} onClose={() => setMapBooking(null)} />}
    </main>
  );
}
