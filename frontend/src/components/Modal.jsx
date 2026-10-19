export default function Modal({ title, onClose, children, className = "" }) {
  return (
    <div className="overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row modal-heading">
          <h2>{title}</h2>
          <button className="icon-button modal-close" type="button" onClick={onClose} aria-label="Close dialog" title="Close"><span aria-hidden="true">×</span></button>
        </div>
        {children}
      </section>
    </div>
  );
}
