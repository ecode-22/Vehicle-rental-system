export default function SkeletonLoader({ count = 4 }) {
  return (
    <div className="grid skeleton-grid" aria-label="Loading vehicles" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <article className="card car skeleton-card" key={index}>
          <div className="skeleton-block skeleton-image" />
          <div className="skeleton-content">
            <div className="skeleton-block skeleton-line short" />
            <div className="skeleton-block skeleton-line title" />
            <div className="skeleton-block skeleton-line" />
            <div className="skeleton-block skeleton-line medium" />
          </div>
        </article>
      ))}
    </div>
  );
}
