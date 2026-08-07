import Image from "next/image";

export function CompanyLogo({ compact = false }: Readonly<{ compact?: boolean }>) {
  return (
    <div
      aria-label="Nimbus Harbor and Striker Facility Management Services"
      className={compact ? "company-logo compact" : "company-logo"}
      role="img"
    >
      <div className="company-logo-marks">
        <Image
          alt="Nimbus Harbor Facilities Management"
          height={115}
          priority
          src="/nimbus-harbor-logo.png"
          unoptimized
          width={200}
        />
        <span aria-hidden="true" className="company-logo-divider" />
        <Image
          alt="Striker Facility Management Services"
          height={105}
          priority
          src="/striker-logo.png"
          unoptimized
          width={210}
        />
      </div>
      <div className="company-logo-product">
        <span>Imprest workflow</span>
        <strong>Imprest Claim</strong>
      </div>
    </div>
  );
}
