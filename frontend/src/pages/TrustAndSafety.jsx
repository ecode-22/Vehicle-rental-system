import { useEffect, useState } from "react";
import { ShieldCheck, Flag, CircleCheck } from "lucide-react";
import { api } from "../services/api.js";
import StatusBadge from "../components/StatusBadge.jsx";
import SkeletonLoader from "../components/SkeletonLoader.jsx";

export default function TrustAndSafety() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([api("/background-checks/"), api("/problem-reports/")])
      .then(([checks, reports]) => { if (active) setData({ checks, reports }); })
      .catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, []);

  if (error) return <main className="trust-page"><div className="err">{error}</div></main>;
  if (!data) return <main className="trust-page"><SkeletonLoader count={2} /></main>;

  return (
    <main className="trust-page">
      <header className="page-heading">
        <span className="eyebrow">DRIVER SAFETY</span>
        <h1>Trust, with clear limits.</h1>
        <p className="sub">Review consent requests and vehicle reports connected to your account.</p>
      </header>
      <section className="trust-section">
        <div className="section-heading"><div><span className="eyebrow">CONSENT RECORDS</span><h2><ShieldCheck size={19} /> Background-check consent</h2></div><span>{data.checks.length} requests</span></div>
        <p className="trust-notice">These records track consent only. No driver's licence verification or background screening provider is connected.</p>
        {data.checks.length ? <div className="trust-list">{data.checks.map(check => <article className="trust-row" key={check.id}><div><b>{check.car_name}</b><span>Booking #{check.booking_id} · {new Date(check.created_at).toLocaleDateString()}</span></div><StatusBadge status={check.status} /></article>)}</div> : <div className="empty">No consent requests are associated with your account.</div>}
      </section>
      <section className="trust-section">
        <div className="section-heading"><div><span className="eyebrow">VEHICLE CARE</span><h2><Flag size={19} /> Problem reports</h2></div><span>{data.reports.length} reports</span></div>
        {data.reports.length ? <div className="trust-list">{data.reports.map(report => <article className="trust-row" key={report.id}><div><b>{report.car_name}</b><span>{report.description}</span></div><StatusBadge status={report.status} /></article>)}</div> : <div className="empty"><CircleCheck size={20} /> No vehicle problem reports to review.</div>}
      </section>
    </main>
  );
}
