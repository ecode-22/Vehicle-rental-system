import { Link, useParams } from "react-router-dom";

export default function HandoverUnavailable() {
  const { bookingId } = useParams();

  return (
    <main className="page-state">
      <span className="eyebrow">BOOKING {bookingId}</span>
      <h1>Handover check-in is not available yet</h1>
      <p className="sub">This booking does not have a digital check-in or check-out record.</p>
      <Link className="btn" to="/trips">Back to trips</Link>
    </main>
  );
}
