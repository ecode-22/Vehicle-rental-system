/*
 * Place search for DriveEasy.
 *
 * - suggestPlaces(): search-as-you-type suggestions. Uses Photon (an OpenStreetMap search
 *   built for autocomplete). Nominatim's public server forbids autocomplete, so it is not
 *   used for this.
 * - locatePlace(): one lookup for a typed place when the user submits a form (Nominatim).
 *
 * The public Photon server is fine for development and light traffic. For production,
 * self-host Photon or swap SUGGEST_URL / parseFeature for a keyed provider (Geoapify,
 * MapTiler, LocationIQ). Everything else in the app only talks to the functions below.
 */

const SUGGEST_URL = "https://photon.komoot.io/api/";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
// west,south,east,north - a box around South Africa so results stay local
const SOUTH_AFRICA_BBOX = "16.3,-35.0,33.0,-22.0";
const MAX_CACHE = 60;

const suggestionCache = new Map();
const placeCache = new Map();

const normalize = text => text.trim().toLowerCase().replace(/\s+/g, " ");

function remember(cache, key, value) {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}

function kindOf(properties) {
  const key = properties.osm_key;
  const value = properties.osm_value;
  if (key === "aeroway") return "Airport";
  if (key === "railway" || value === "station" || value === "bus_station") return "Station";
  if (value === "city") return "City";
  if (value === "town") return "Town";
  if (value === "village" || value === "hamlet") return "Village";
  if (["suburb", "neighbourhood", "quarter", "district", "locality"].includes(value)) return "Suburb";
  if (key === "highway") return "Street";
  if (properties.housenumber) return "Address";
  if (key === "place" || key === "boundary") return "Area";
  return "Place";
}

/** Turn one Photon GeoJSON feature into the shape the UI uses, or null if unusable. */
export function parseFeature(feature) {
  const properties = feature?.properties || {};
  const [lng, lat] = feature?.geometry?.coordinates || [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (properties.countrycode && properties.countrycode.toUpperCase() !== "ZA") return null;

  const street = [properties.housenumber, properties.street].filter(Boolean).join(" ");
  const primary = properties.name || street || properties.city || properties.county || properties.state;
  if (!primary) return null;

  const secondary = [...new Set([
    properties.name ? street : null,
    properties.district || properties.locality,
    properties.city,
    properties.state
  ].filter(part => part && part !== primary))];

  return {
    id: `${properties.osm_type || "x"}${properties.osm_id || ""}:${lat.toFixed(5)},${lng.toFixed(5)}`,
    primary,
    secondary: secondary.join(", "),
    label: [primary, ...secondary].join(", "),
    kind: kindOf(properties),
    coordinates: [lat, lng]
  };
}

export function getCachedSuggestions(query) {
  return suggestionCache.get(normalize(query)) || null;
}

/** Throws on network or server errors (so the UI can say so). AbortError means "ignore". */
export async function suggestPlaces(query, { signal } = {}) {
  const key = normalize(query);
  if (suggestionCache.has(key)) return suggestionCache.get(key);

  const params = new URLSearchParams({ q: query.trim(), limit: "10", lang: "en", bbox: SOUTH_AFRICA_BBOX });
  const response = await fetch(`${SUGGEST_URL}?${params}`, { signal });
  if (!response.ok) throw new Error(`Place search failed (${response.status})`);

  const data = await response.json();
  const seen = new Set();
  const results = (data.features || [])
    .map(parseFeature)
    .filter(item => {
      if (!item || seen.has(item.label)) return false;
      seen.add(item.label);
      return true;
    })
    .slice(0, 6);

  remember(suggestionCache, key, results);
  return results;
}

/** Single lookup for a typed place (used when a form is submitted without picking a suggestion). */
export async function locatePlace(place) {
  const key = normalize(place || "");
  if (!key) return null;
  if (placeCache.has(key)) return placeCache.get(key);
  try {
    const params = new URLSearchParams({ q: `${place}, South Africa`, format: "jsonv2", limit: "1", countrycodes: "za" });
    const response = await fetch(`${NOMINATIM_URL}?${params}`);
    if (!response.ok) return null;
    const [result] = await response.json();
    const coordinates = result ? [Number(result.lat), Number(result.lon)] : null;
    if (coordinates) remember(placeCache, key, coordinates);
    return coordinates;
  } catch {
    return null;
  }
}
