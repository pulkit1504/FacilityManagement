import { BookOpenCheck, FileSpreadsheet, ReceiptText, Route, WalletCards } from "lucide-react";

const steps = [
  {
    icon: ReceiptText,
    title: "Create and itemize",
    text: "Choose the correct expense month and site. Save every voucher as a separate line item before submitting."
  },
  {
    icon: FileSpreadsheet,
    title: "Attach evidence",
    text: "Attach the receipt to each line and enter the vendor, vendor invoice, and client invoice references when required."
  },
  {
    icon: Route,
    title: "Submit and track",
    text: "Submit once, download the summary sheet, and use My Claims to see exactly where the request is pending."
  },
  {
    icon: WalletCards,
    title: "Settle advances",
    text: "Apply paid Imprest advances to reimbursement claims and respond to returned claims from My Claims."
  }
];

export function ApplicationTutorial() {
  return (
    <div className="grid" style={{ gap: 16 }}>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Imprest Claim quick start</h2>
            <p className="muted">A claimant-to-audit walkthrough for a complete, approval-ready claim.</p>
          </div>
          <BookOpenCheck aria-hidden="true" size={24} />
        </div>
        <div className="tutorial-steps">
          {steps.map(({ icon: Icon, title, text }, index) => (
            <article className="card tutorial-step" key={title}>
              <div className="tutorial-step-number">{index + 1}</div>
              <Icon aria-hidden="true" size={22} />
              <div>
                <h3>{title}</h3>
                <p className="muted">{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
