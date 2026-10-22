import { useEffect, useState } from "react";

export default function RequestIndicator() {
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const update = event => setPending(event.detail || 0);
    window.addEventListener("api:loading", update);
    return () => window.removeEventListener("api:loading", update);
  }, []);
  return <div className={`request-progress${pending ? " active" : ""}`} aria-hidden="true"><span /></div>;
}
