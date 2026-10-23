import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LngLatBounds, Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { Globe, Scan } from "lucide-react";

/*
 * 3D globe map. Same props as the old Leaflet MapView:
 *   markers: [{ id, position: [lat, lng], color, active, popup }]
 *   origin:  [lat, lng] pickup point, center / zoom: fallback camera, onMarkerClick(id)
 *
 * Basemap tiles come from CARTO's free GL styles (no API key). They are fine for development
 * and modest traffic; check CARTO's terms before a commercial launch, or point STYLES at
 * another provider (MapTiler, Stadia, self-hosted) - nothing else in this file changes.
 */
const STYLES = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
};
const SKY = {
  dark: { "sky-color": "#0a1c26", "horizon-color": "#3f8f78", "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0] },
  light: { "sky-color": "#a9cde6", "horizon-color": "#e6f2ee", "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0] }
};
// MapLibre looks for its web worker next to its own file. Vite moves that file in dev (pre-bundling)
// and never copies the worker into a production build, so the map would not load. Give it a real URL.
setWorkerUrl(workerUrl);

const ORIGIN_ID = "__origin__";
const GLOBE_ZOOM = 1.5;
const GLOBE_VIEW_BELOW = 3.5;

const readTheme = () => document.documentElement.dataset.theme === "light" ? "light" : "dark";
const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const validPoint = point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);

const carFeatures = markers => ({
  type: "FeatureCollection",
  features: markers.filter(marker => validPoint(marker.position)).map(marker => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [marker.position[1], marker.position[0]] },
    properties: { id: marker.id, color: marker.color || "#48d3a3", active: Boolean(marker.active) }
  }))
});

const originFeatures = origin => ({
  type: "FeatureCollection",
  features: validPoint(origin) ? [{ type: "Feature", geometry: { type: "Point", coordinates: [origin[1], origin[0]] }, properties: {} }] : []
});

function addMapLayers(map) {
  if (!map.getSource("cars")) map.addSource("cars", { type: "geojson", data: carFeatures([]) });
  if (!map.getSource("origin")) map.addSource("origin", { type: "geojson", data: originFeatures(null) });
  if (!map.getLayer("origin-halo")) map.addLayer({ id: "origin-halo", type: "circle", source: "origin", paint: { "circle-radius": 17, "circle-color": "#48d3a3", "circle-opacity": 0.25 } });
  if (!map.getLayer("origin")) map.addLayer({ id: "origin", type: "circle", source: "origin", paint: { "circle-radius": 8, "circle-color": "#48d3a3", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
  if (!map.getLayer("cars-halo")) map.addLayer({ id: "cars-halo", type: "circle", source: "cars", filter: ["==", ["get", "active"], true], paint: { "circle-radius": 20, "circle-color": "#f7c66b", "circle-opacity": 0.28, "circle-blur": 0.6 } });
  if (!map.getLayer("cars")) map.addLayer({ id: "cars", type: "circle", source: "cars", paint: { "circle-radius": ["case", ["get", "active"], 10, 7], "circle-color": ["get", "color"], "circle-stroke-color": "#f7faf9", "circle-stroke-width": 2 } });
}

export default function GlobeMap({ markers = [], origin = null, center = [-33.9, 18.7], zoom = 9, className = "pickup-map", onMarkerClick }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const introDone = useRef(false);
  const fallbackTimer = useRef(null);
  const popupRef = useRef(null);
  const popupNode = useRef(null);
  if (!popupNode.current) popupNode.current = document.createElement("div");

  const [theme, setTheme] = useState(readTheme);
  const [failed, setFailed] = useState(false);
  const [popupId, setPopupId] = useState(null);
  const [atGlobe, setAtGlobe] = useState(() => !prefersReducedMotion());

  // Latest props for event handlers that were registered once
  const markersRef = useRef(markers);
  const originRef = useRef(origin);
  const themeRef = useRef(theme);
  const clickRef = useRef(onMarkerClick);
  const centerRef = useRef({ center, zoom });
  markersRef.current = markers;
  originRef.current = origin;
  themeRef.current = theme;
  clickRef.current = onMarkerClick;
  centerRef.current = { center, zoom };

  const pushData = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.getSource("cars")?.setData(carFeatures(markersRef.current));
    map.getSource("origin")?.setData(originFeatures(originRef.current));
  }, []);

  const fitToPoints = useCallback(duration => {
    const map = mapRef.current;
    if (!map) return false;
    const points = [...markersRef.current.map(marker => marker.position), ...(originRef.current ? [originRef.current] : [])].filter(validPoint);
    if (!points.length) return false;
    const time = prefersReducedMotion() ? 0 : duration;
    if (points.length === 1) {
      map.flyTo({ center: [points[0][1], points[0][0]], zoom: 9, duration: time, essential: true });
    } else {
      const bounds = new LngLatBounds();
      points.forEach(point => bounds.extend([point[1], point[0]]));
      map.fitBounds(bounds, { padding: 48, maxZoom: 11, duration: time, essential: true });
    }
    return true;
  }, []);

  const openPopup = useCallback((lngLat, id) => {
    const map = mapRef.current;
    if (!map) return;
    popupRef.current?.remove();
    const popup = new Popup({ offset: 14, maxWidth: "260px", className: "globe-popup" })
      .setLngLat(lngLat).setDOMContent(popupNode.current).addTo(map);
    popup.on("close", () => setPopupId(current => current === id ? null : current));
    popupRef.current = popup;
    setPopupId(id);
  }, []);

  // Create the map once
  useEffect(() => {
    const first = [...markersRef.current.map(marker => marker.position), originRef.current].find(validPoint) || centerRef.current.center;
    const intro = !prefersReducedMotion();
    let map;
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: STYLES[themeRef.current],
        center: [first[1], first[0]],
        zoom: intro ? GLOBE_ZOOM : centerRef.current.zoom,
        maxPitch: 70,
        cooperativeGestures: true
      });
    } catch {
      setFailed(true);
      return undefined;
    }
    mapRef.current = map;
    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");

    map.on("style.load", () => {
      readyRef.current = true;
      setFailed(false);
      addMapLayers(map);
      pushData();
    });
    map.on("error", () => { if (!readyRef.current) setFailed(true); });
    map.on("moveend", () => setAtGlobe(map.getZoom() < GLOBE_VIEW_BELOW));

    map.on("click", "cars", event => {
      const feature = event.features?.[0];
      if (!feature) return;
      const id = feature.properties.id;
      clickRef.current?.(id);
      if (markersRef.current.find(marker => marker.id === id)?.popup) openPopup(feature.geometry.coordinates.slice(), id);
    });
    map.on("click", "origin", event => {
      const feature = event.features?.[0];
      if (feature) openPopup(feature.geometry.coordinates.slice(), ORIGIN_ID);
    });
    ["cars", "origin"].forEach(layer => {
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
    });

    
    // ResizeObserver to handle flex/grid layout shifts where dimensions start at 0
    const observer = new ResizeObserver(() => {
      map.resize();
    });
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    
    setTimeout(() => map.resize(), 200);
    return () => {
      clearTimeout(fallbackTimer.current);
      popupRef.current?.remove();
      readyRef.current = false;
      mapRef.current = null;
      observer.disconnect();
    map.remove();
    };
  }, [openPopup, pushData]);

  // Follow the app's light/dark theme toggle
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  const appliedTheme = useRef(theme);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedTheme.current === theme) return;
    appliedTheme.current = theme;
    readyRef.current = false;
    map.setStyle(STYLES[theme]); // "style.load" re-adds the globe, sky and pins
  }, [theme]);

  // Keep pins in sync and move the camera when the set of points changes
  const pointsKey = JSON.stringify([markers.map(marker => marker.position), origin]);
  const pinsKey = markers.map(marker => `${marker.id}:${marker.active}:${marker.color}`).join("|");
  useEffect(() => { pushData(); }, [pushData, pointsKey, pinsKey]);
  useEffect(() => {
    clearTimeout(fallbackTimer.current);
    // First time: a long fly-in from the whole globe. Later: a short glide.
    if (fitToPoints(introDone.current ? 1400 : 3200)) { introDone.current = true; return undefined; }
    if (!introDone.current) {
      // No pins yet (still loading, or none exist): settle on the default area after a moment
      fallbackTimer.current = setTimeout(() => {
        introDone.current = true;
        const { center: fallback, zoom: fallbackZoom } = centerRef.current;
        mapRef.current?.flyTo({ center: [fallback[1], fallback[0]], zoom: Math.min(fallbackZoom, 7), duration: prefersReducedMotion() ? 0 : 2600, essential: true });
      }, 1500);
    }
    return () => clearTimeout(fallbackTimer.current);
  }, [fitToPoints, pointsKey]);

  const hasPins = markers.some(marker => validPoint(marker.position)) || validPoint(origin);
  const toggleView = () => {
    const map = mapRef.current;
    if (!map) return;
    if (atGlobe && hasPins) fitToPoints(1800);
    else map.flyTo({ center: map.getCenter(), zoom: GLOBE_ZOOM, duration: prefersReducedMotion() ? 0 : 2400, essential: true });
  };

  const popupBody = popupId === ORIGIN_ID ? "Your pickup location" : markers.find(marker => marker.id === popupId)?.popup;

  return (
    <div className={`globe-map ${className}`} role="region" aria-label="Interactive 3D map of pickup locations">
      <div ref={containerRef} className="globe-canvas" />
      {failed && <div className="globe-status" role="status">The map couldn't load. Check your connection, or that your browser allows WebGL.</div>}
      {!failed && (hasPins || !atGlobe) && (
        <button type="button" className="globe-toggle" onClick={toggleView}>
          {atGlobe && hasPins ? <><Scan size={14} aria-hidden="true" /> Fit pins</> : <><Globe size={14} aria-hidden="true" /> Globe view</>}
        </button>
      )}
      {popupId !== null && popupBody && createPortal(popupBody, popupNode.current)}
    </div>
  );
}
