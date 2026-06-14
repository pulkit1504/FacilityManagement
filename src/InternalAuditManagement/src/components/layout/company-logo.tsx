import Image from "next/image";

export function CompanyLogo({ compact = false }: Readonly<{ compact?: boolean }>) {
  return (
    <div className={compact ? "company-logo compact" : "company-logo"}>
      <Image
        alt="Nimbus Harbor and Striker Facility Management Services"
        height={256}
        priority
        src="/company-logo.png"
        unoptimized
        width={256}
      />
      {!compact ? (
        <div>
          <strong>Facility Control</strong>
          <span>Expense, billing, and audit workflow</span>
        </div>
      ) : null}
    </div>
  );
}
