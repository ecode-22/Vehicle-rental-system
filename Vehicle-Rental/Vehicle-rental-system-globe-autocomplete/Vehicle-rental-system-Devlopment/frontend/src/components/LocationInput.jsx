import { useEffect, useId, useRef, useState } from "react";
import { Building2, Check, LoaderCircle, MapPin, Plane, Route, TrainFront, X } from "lucide-react";
import { getCachedSuggestions, suggestPlaces } from "../services/geocode.js";

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;

const KIND_ICON = { Airport: Plane, Station: TrainFront, Street: Route, Address: Route, City: Building2, Town: Building2 };

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, query }) {
  const tokens = query.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (!tokens.length) return text;
  return text.split(new RegExp(`(${tokens.join("|")})`, "ig")).map((part, index) => index % 2 ? <b key={index}>{part}</b> : part);
}

/**
 * Text input that suggests South African places while you type.
 * onChange(value, coordinates): coordinates is [lat, lng] when a suggestion was picked,
 * and null while the user is typing (so callers can tell "typed" from "picked").
 */
export default function LocationInput({
  id, label, value, onChange, required = false, className = "",
  placeholder = "Start typing a town, suburb, airport or address"
}) {
  const listId = useId();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [pickedLabel, setPickedLabel] = useState(null);
  const timer = useRef(null);
  const controller = useRef(null);

  useEffect(() => () => { clearTimeout(timer.current); controller.current?.abort(); }, []);

  const confirmed = pickedLabel !== null && pickedLabel === value;
  const showList = open && !confirmed && status !== "idle";

  const search = text => {
    clearTimeout(timer.current);
    controller.current?.abort();
    setHighlight(-1);
    if (text.trim().length < MIN_CHARS) { setItems([]); setStatus("idle"); return; }
    const cached = getCachedSuggestions(text);
    if (cached) { setItems(cached); setStatus("ready"); return; }
    setStatus("loading");
    timer.current = setTimeout(async () => {
      const current = new AbortController();
      controller.current = current;
      try {
        const results = await suggestPlaces(text, { signal: current.signal });
        if (current.signal.aborted) return; // a newer search replaced this one
        setItems(results);
        setStatus("ready");
      } catch (error) {
        if (error.name === "AbortError" || current.signal.aborted) return;
        setItems([]);
        setStatus("error");
      }
    }, DEBOUNCE_MS);
  };

  const pick = place => {
    clearTimeout(timer.current);
    controller.current?.abort();
    setPickedLabel(place.label);
    onChange(place.label, place.coordinates);
    setItems([]);
    setStatus("idle");
    setOpen(false);
    setHighlight(-1);
  };

  const onKeyDown = event => {
    const hasItems = showList && items.length > 0;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!hasItems) { if (status !== "idle") setOpen(true); return; }
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight(current => (current + step + items.length) % items.length);
    } else if (event.key === "Enter") {
      // Enter chooses the highlighted suggestion, or the best match if none is highlighted
      if (hasItems) { event.preventDefault(); pick(items[highlight >= 0 ? highlight : 0]); }
    } else if (event.key === "Escape" && showList) {
      event.preventDefault();
      setOpen(false);
    }
  };

  const slot = status === "loading" ? <LoaderCircle size={16} className="location-spin" aria-hidden="true" />
    : confirmed ? <Check size={16} className="location-check" aria-hidden="true" />
    : value ? <button type="button" className="location-clear" aria-label="Clear location" onClick={() => { onChange("", null); setPickedLabel(null); search(""); }}><X size={14} /></button>
    : null;

  return (
    <div className={`location-picker ${className}`} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      {label && <label htmlFor={id}>{label}</label>}
      <div className={`location-field${confirmed ? " confirmed" : ""}`}>
        <input
          id={id} required={required} autoComplete="off" spellCheck="false" placeholder={placeholder} value={value}
          role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={showList && highlight >= 0 ? `${listId}-${highlight}` : undefined}
          aria-label={label ? undefined : placeholder}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onChange={event => { setOpen(true); onChange(event.target.value, null); search(event.target.value); }}
        />
        {slot && <span className="location-slot">{slot}</span>}
      </div>
      {showList && (
        <div className="location-suggestions" id={listId} role="listbox" aria-label="Place suggestions" onMouseDown={event => event.preventDefault()}>
          {items.map((place, index) => {
            const Icon = KIND_ICON[place.kind] || MapPin;
            return (
              <div key={place.id} id={`${listId}-${index}`} role="option" aria-selected={index === highlight}
                className={`location-option${index === highlight ? " highlighted" : ""}`}
                onMouseEnter={() => setHighlight(index)} onClick={() => pick(place)}>
                <Icon size={15} aria-hidden="true" />
                <span className="location-text">
                  <span className="location-primary"><Highlight text={place.primary} query={value} /></span>
                  {place.secondary && <span className="location-secondary">{place.secondary}</span>}
                </span>
                <span className="location-kind">{place.kind}</span>
              </div>
            );
          })}
          {status === "loading" && items.length === 0 && <div className="location-note-row"><LoaderCircle size={14} className="location-spin" aria-hidden="true" />Searching South Africa…</div>}
          {status === "ready" && items.length === 0 && <div className="location-note-row">No matches yet. Try a nearby town or suburb.</div>}
          {status === "error" && <div className="location-note-row">Suggestions aren't available right now. You can still type a place and continue.</div>}
          <div className="location-credit">Search by Photon · © OpenStreetMap contributors</div>
        </div>
      )}
      <span className="sr-only" aria-live="polite">{showList && status === "ready" ? `${items.length} suggestion${items.length === 1 ? "" : "s"} available` : ""}</span>
    </div>
  );
}
