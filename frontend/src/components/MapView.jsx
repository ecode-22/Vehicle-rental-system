import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";

function FitMarkers({ markers, origin }) {
  const map = useMap();
  const locationKey = markers.map(marker => marker.position.join(",")).join("|");
  useEffect(() => {
    const positions = [...markers.map(marker => marker.position), ...(origin ? [origin] : [])];
    if (positions.length) map.fitBounds(L.latLngBounds(positions), { padding: [28, 28], maxZoom: 11 });
  }, [map, locationKey, origin]);
  return null;
}

export default function MapView({ markers = [], origin, center = [-33.9, 18.7], zoom = 9, className = "pickup-map", onMarkerClick }) {
  return (
    <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} className={className}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitMarkers markers={markers} origin={origin} />
      {origin && <CircleMarker center={origin} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#48d3a3", fillOpacity: 1 }}><Popup>Your pickup location</Popup></CircleMarker>}
      {markers.map(marker => (
        <CircleMarker key={marker.id} center={marker.position} radius={marker.active ? 10 : 7} eventHandlers={{ click: () => onMarkerClick?.(marker.id) }} pathOptions={{ color: "#f7faf9", weight: 2, fillColor: marker.color || "#48d3a3", fillOpacity: 1 }}>
          {marker.popup && <Popup>{marker.popup}</Popup>}
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
