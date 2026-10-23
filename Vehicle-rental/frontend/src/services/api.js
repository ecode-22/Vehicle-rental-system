const getApi = () => localStorage.getItem("apiBase") || import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";
let pendingRequests = 0;

function announceLoading(delta) {
  pendingRequests = Math.max(0, pendingRequests + delta);
  window.dispatchEvent(new CustomEvent("api:loading", { detail: pendingRequests }));
}

function errText(data) {
  if (!data) return "Request failed";
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;
  return Object.entries(data).map(([key, value]) => {
    const message = [].concat(value).map(item => typeof item === "string" ? item : JSON.stringify(item)).join(" ");
    return key === "non_field_errors" ? message : `${key}: ${message}`;
  }).join(" • ");
}

export function clearSession() {
  ["access", "refresh", "user"].forEach(key => localStorage.removeItem(key));
  window.dispatchEvent(new Event("session-ended"));
}

export async function api(path, { method = "GET", body, auth = true } = {}) {
  const multipart = typeof FormData !== "undefined" && body instanceof FormData;
  const requestBody = body ? multipart ? body : JSON.stringify(body) : undefined;
  const run = () => {
    const headers = multipart ? {} : { "Content-Type": "application/json" };
    const token = localStorage.getItem("access");
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    return fetch(getApi() + path, { method, headers, body: requestBody });
  };

  announceLoading(1);
  try {
    let response;
    try {
      response = await run();
      if (response.status === 401 && auth && localStorage.getItem("refresh")) {
        const refresh = await fetch(getApi() + "/auth/refresh/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh: localStorage.getItem("refresh") })
        });
        if (refresh.ok) {
          localStorage.setItem("access", (await refresh.json()).access);
          response = await run();
        } else {
          clearSession();
          response = await fetch(getApi() + path, {
            method,
            headers: multipart ? {} : { "Content-Type": "application/json" },
            body: requestBody
          });
        }
      }
    } catch {
      throw new Error(`Can't reach the server at ${getApi()}. Is Django running?`);
    }

    if (response.status === 204) return null;
    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(errText(data));
    return data;
  } finally {
    announceLoading(-1);
  }
}

export { getApi };
