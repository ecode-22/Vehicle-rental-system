import { useEffect } from "react";
import { createPortal } from "react-dom";

/*
 * Rendered straight into <body>: page sections keep an animation "transform" after they appear, and a
 * transformed parent turns `position: fixed` into "fixed to that section", which pushed the bottom of
 * tall dialogs off short laptop screens. The header and footer stay in view and only the body scrolls.
 */
export default function Modal({ title, onClose, children, footer, className = "" }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // the page behind the dialog should not scroll
    return () => { document.body.style.overflow = previous; };
  }, []);

  return createPortal(
    <div className="overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row modal-heading">
          <h2>{title}</h2>
          <button className="icon-button modal-close" type="button" onClick={onClose} aria-label="Close dialog" title="Close"><span aria-hidden="true">×</span></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </section>
    </div>,
    document.body
  );
}
