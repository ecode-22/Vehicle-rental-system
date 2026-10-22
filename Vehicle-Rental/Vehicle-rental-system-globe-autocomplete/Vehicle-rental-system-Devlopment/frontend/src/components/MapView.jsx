import { Suspense, lazy } from "react";

// The 3D globe (MapLibre) is a large library, so it loads only when a map is first shown.
const GlobeMap = lazy(() => import("./GlobeMap.jsx"));

export default function MapView(props) {
  return (
    <Suspense fallback={<div className={`globe-map ${props.className || "pickup-map"}`}><div className="globe-status" role="status">Loading map…</div></div>}>
      <GlobeMap {...props} />
    </Suspense>
  );
}
