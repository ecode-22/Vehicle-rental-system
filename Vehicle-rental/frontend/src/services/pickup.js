/*
 * The place a customer searched on the home page becomes the suggested pick-up on a car's booking form.
 * Kept in sessionStorage so it lasts for the visit and is never sent anywhere else.
 */
const KEY = "driveeasy.pickup";

export function savePickupSearch(label, coordinates) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ label, coordinates })); } catch { /* storage can be unavailable */ }
}

export function readPickupSearch() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
    return saved && typeof saved.label === "string" && saved.label ? saved : null;
  } catch { return null; }
}

export function clearPickupSearch() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
