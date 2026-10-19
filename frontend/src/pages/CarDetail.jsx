import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../services/api.js";
import SkeletonLoader from "../components/SkeletonLoader.jsx";

export default function CarDetail({ DetailView, onBooked }) {
  const { carId } = useParams();
  const navigate = useNavigate();
  const [car, setCar] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setCar(null);
    setError("");
    api(`/cars/${carId}/`, { auth: false })
      .then(result => { if (active) setCar(result); })
      .catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [carId]);

  if (error) return <main className="page-state"><h1>Vehicle unavailable</h1><p>{error}</p><button className="btn" onClick={() => navigate("/")}>Back to discovery</button></main>;
  if (!car) return <main className="page-state"><SkeletonLoader count={1} /></main>;

  return <DetailView car={car} onClose={() => navigate(-1)} onDone={() => { onBooked(); navigate("/trips"); }} />;
}
