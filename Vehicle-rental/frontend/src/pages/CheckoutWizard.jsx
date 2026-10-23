export default function CheckoutWizard({ steps, activeStep, onStepChange, children }) {
  return (
    <div className="checkout-wizard">
      <ol className="checkout-steps" aria-label="Booking request progress">
        {steps.map((step, index) => (
          <li key={step} className={index === activeStep ? "active" : index < activeStep ? "complete" : ""}>
            <button type="button" onClick={() => index < activeStep && onStepChange(index)} aria-current={index === activeStep ? "step" : undefined} disabled={index > activeStep}>
              <span>{index < activeStep ? "✓" : `0${index + 1}`}</span>{step}
            </button>
          </li>
        ))}
      </ol>
      <div className="checkout-step-content">{children}</div>
    </div>
  );
}
