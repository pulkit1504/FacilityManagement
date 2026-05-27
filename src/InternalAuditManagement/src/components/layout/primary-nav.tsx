"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardCheck, FileText, Link2, ReceiptText, Settings, ShieldCheck } from "lucide-react";

const iconMap = {
  BarChart3,
  ClipboardCheck,
  FileText,
  Link2,
  ReceiptText,
  Settings,
  ShieldCheck
};

type PrimaryNavLink = {
  href: string;
  label: string;
  icon: keyof typeof iconMap;
  exact?: boolean;
};

export function PrimaryNav({ links }: Readonly<{ links: PrimaryNavLink[] }>) {
  const pathname = usePathname();

  return (
    <nav className="nav" aria-label="Primary navigation">
      {links.map((link) => {
        const Icon = iconMap[link.icon];
        const isActive = link.href === "/" || link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link aria-current={isActive ? "page" : undefined} className={isActive ? "active" : undefined} href={link.href} key={link.href}>
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <Icon size={16} aria-hidden="true" />
              {link.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
