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
      <section className="panel tutorial-player">
        <div className="section-heading">
          <div>
            <h2>Application tutorial</h2>
            <p className="muted">A short walkthrough of the claimant, approval, Finance, and Audit journey.</p>
          </div>
          <BookOpenCheck aria-hidden="true" size={24} />
        </div>
        <video controls playsInline poster="/tutorial-poster.png" preload="metadata">
          <source src="/application-tutorial.webm" type="video/webm" />
          Your browser does not support embedded video. Use the quick-start instructions below.
        </video>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Quick start</h2>
            <p className="muted">The minimum steps for a complete, approval-ready claim.</p>
          </div>
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
