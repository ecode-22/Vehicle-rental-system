import { CarFront, MapPin, Phone, Star } from "lucide-react";
import { telHref } from "../services/contact.js";

export default function VehicleCard({ car, distance, total, days, active = false, onHover, onBook }) {
  const image = car.photos?.[0]?.image || car.image || car.image_url;
  return (
    <article className={`card car${active ? " selected" : ""}`} onMouseEnter={() => onHover?.(car.id)} onMouseLeave={() => onHover?.(null)}>
      <div className="img">{image ? <img src={image} alt={`${car.year} ${car.make} ${car.model}`} onError={event => { event.currentTarget.style.display = "none"; }} /> : <CarFront size={44} strokeWidth={1.3} />}</div>
      <div className="body">
        <div className="car-location"><MapPin size={14} />{car.location || "Location on request"}{distance != null && <span>{Math.round(distance)} km</span>}</div>
        <h3>{car.year} {car.make} {car.model}</h3>
        <div className="car-owner">
          Listed by {car.owner_name}
          {car.owner_contact?.phone && <> · <a className="car-contact" href={telHref(car.owner_contact.phone)} aria-label={`Call ${car.owner_name} on ${car.owner_contact.phone}`}><Phone size={11} aria-hidden="true" /> {car.owner_contact.phone}</a></>}
        </div>
        <div className="car-rating" aria-label={car.rating_count ? `${Number(car.average_rating).toFixed(1)} out of 5 from ${car.rating_count} ratings` : "Not rated yet"}>
          <Star size={14} fill={car.rating_count ? "currentColor" : "none"} />
          <b>{car.rating_count ? Number(car.average_rating).toFixed(1) : "New"}</b>
          <span>{car.rating_count ? `(${car.rating_count} rating${car.rating_count === 1 ? "" : "s"})` : "No ratings yet"}</span>
        </div>
        <div className="tags"><span className="tag">{car.seats} seats</span><span className="tag">{car.transmission}</span><span className="tag">{car.fuel}</span></div>
        <div className="row car-price-row">
          <div className="price">{total == null ? <>R{Number(car.price_per_day).toLocaleString()}<small> /day</small></> : <>{`R${Number(total).toLocaleString()}`}<small> total · {days} day{days === 1 ? "" : "s"}</small></>}</div>
          <button className="btn sm" disabled={onBook === undefined} onClick={() => onBook?.(car)}>{onBook ? "View & book" : "Unavailable"}</button>
        </div>
      </div>
    </article>
  );
}
