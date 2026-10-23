import { useEffect, useState } from "react";
import { LocateFixed, MapPin, MapPinned, Search } from "lucide-react";
import { api } from "../services/api.js";
import MapView from "../components/MapView.jsx";
import LocationInput from "../components/LocationInput.jsx";
import SkeletonLoader from "../components/SkeletonLoader.jsx";
import VehicleCard from "../components/VehicleCard.jsx";

const money = value => `R${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function distanceKm([lat1, lon1], [lat2, lon2]) {
  const radians = value => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function HomeDiscovery({ user, go, toast, locatePlace, currency = "R" }) {
  const [cars, setCars] = useState(null);
  const [mapCars, setMapCars] = useState([]);
  const [filters, setFilters] = useState({ search: "", max_price: "", transmission: "", fuel: "", start_date: "", end_date: "" });
  const [place, setPlace] = useState("");
  const [origin, setOrigin] = useState(null);
  const [locating, setLocating] = useState(false);
  const [activeCarId, setActiveCarId] = useState(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const queryFilters = { ...filters };
      if (!queryFilters.start_date || !queryFilters.end_date) {
        delete queryFilters.start_date;
        delete queryFilters.end_date;
      }
      const query = new URLSearchParams(Object.entries(queryFilters).filter(([, value]) => value)).toString();
      try { setCars(await api(`/cars/${query ? `?${query}` : ""}`)); }
      catch (error) { setCars([]); toast(error.message, "err"); }
    }, 300);
    return () => clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    if (!cars) return;
    setMapCars(cars.map(car => ({
      ...car,
      coordinates: car.latitude != null && car.longitude != null ? [car.latitude, car.longitude] : null
    })));
  }, [cars]);

  const updateFilter = key => event => setFilters(current => ({ ...current, [key]: event.target.value }));
  const updateStartDate = event => setFilters(current => ({
    ...current,
    start_date: event.target.value,
    end_date: current.end_date && current.end_date < event.target.value ? "" : current.end_date
  }));
  const onBook = car => {
    if (!user) return go("login");
    go(`/cars/${car.id}`);
  };
  const searchPlace = async event => {
    event.preventDefault();
    if (!place.trim()) return;
    setLocating(true);
    const coordinates = await locatePlace(place);
    setLocating(false);
    if (!coordinates) return toast("We couldn't find that South African location. Try a nearby town or city.", "err");
    setOrigin(coordinates);
  };
  const useMyLocation = () => {
    if (!navigator.geolocation) return toast("Location services aren't available in this browser.", "err");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      position => { setOrigin([position.coords.latitude, position.coords.longitude]); setPlace("Your current location"); setLocating(false); },
      () => { setLocating(false); toast("Location permission was unavailable. Enter a town or city instead.", "err"); },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  };

  const sortedCars = origin
    ? mapCars.map(car => ({ ...car, distance: car.coordinates ? distanceKm(origin, car.coordinates) : null })).sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
    : mapCars;
  const mappedCars = mapCars.filter(car => car.coordinates);
  const mapCenter = origin || mappedCars[0]?.coordinates || [-33.9, 18.7];
  const tripDays = filters.start_date && filters.end_date
    ? Math.max(0, Math.round((new Date(filters.end_date) - new Date(filters.start_date)) / 864e5) + 1)
    : null;

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
            <LocationInput id="pickup-location" value={place} placeholder="Town, suburb, airport or address" onChange={(value, coordinates) => { setPlace(value); if (coordinates) setOrigin(coordinates); }} />
            <button className="icon-button" type="button" onClick={useMyLocation} disabled={locating} aria-label="Use my current location" title="Use my current location"><LocateFixed size={19} /></button>
            <button className="btn find-button" type="submit" disabled={locating || !place.trim()}><Search size={17} />{locating ? "Locating" : "Find cars"}</button>
          </div>
          <div className="search-trip-dates">
            <label>Pick-up<input type="date" min={new Date().toISOString().slice(0, 10)} value={filters.start_date} onChange={updateStartDate} /></label>
            <label>Return<input type="date" min={filters.start_date || new Date().toISOString().slice(0, 10)} value={filters.end_date} onChange={updateFilter("end_date")} /></label>
          </div>
          <span className="location-note">{origin ? "Sorted by distance from your pickup point · town-level estimates" : "Enter a location or use your device location to find nearby cars"}</span>
        </form>
      </section>

      <section className="browse-tools" aria-label="Filter cars">
        <div className="results-heading"><div><span className="eyebrow">THE FLEET</span><h2>Cars around you</h2></div><span className="result-count">{cars?.length ?? "..."} available</span></div>
        <div className="filters">
          <label className="filter-field"><span>Search</span><input placeholder="Make or model" value={filters.search} onChange={updateFilter("search")} /></label>
          <label className="filter-field"><span>Maximum per day</span><input type="number" placeholder={`${currency} Any price`} value={filters.max_price} onChange={updateFilter("max_price")} /></label>
          <label className="filter-field"><span>Transmission</span><select value={filters.transmission} onChange={updateFilter("transmission")}><option value="">Any type</option><option value="manual">Manual</option><option value="auto">Automatic</option></select></label>
          <label className="filter-field"><span>Fuel</span><select value={filters.fuel} onChange={updateFilter("fuel")}><option value="">Any fuel</option><option value="petrol">Petrol</option><option value="diesel">Diesel</option><option value="electric">Electric</option><option value="hybrid">Hybrid</option></select></label>
        </div>
      </section>

      <section className="results-layout">
        <div className="results-list">
          {cars === null ? <SkeletonLoader /> : sortedCars.length === 0 ? <div className="empty">No cars found. Try adjusting your filters.</div> : (
            <div className="grid">{sortedCars.map(car => <VehicleCard key={car.id} car={car} distance={car.distance} total={tripDays > 0 ? Number(car.price_per_day) * tripDays : null} days={tripDays} active={activeCarId === car.id} onHover={setActiveCarId} onBook={user?.role === "renter" ? undefined : onBook} />)}</div>
          )}
        </div>
        <aside className="map-panel" aria-label="Car pickup locations map">
          <div className="map-heading"><div><MapPinned size={18} /><b>Pickup locations</b></div><span>{mappedCars.length} mapped</span></div>
          <MapView center={mapCenter} origin={origin} markers={mappedCars.map(car => ({ id: car.id, position: car.coordinates, active: activeCarId === car.id, color: activeCarId === car.id ? "#f7c66b" : "#f07b65", popup: <><b>{car.year} {car.make} {car.model}</b><br />{car.location}<br />{money(car.price_per_day)} / day</> }))} onMarkerClick={setActiveCarId} />
          <p className="map-footnote">Pins show the town or city supplied by the renter, not an exact vehicle address. Drag to spin the globe.</p>
        </aside>
      </section>
    </main>
  );
}
