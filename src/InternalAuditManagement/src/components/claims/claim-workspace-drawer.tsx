"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

type ClaimWorkspaceDrawerProps = {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  subtitle?: string;
  title: string;
};

export function ClaimWorkspaceDrawer({ children, isOpen, onClose, subtitle, title }: ClaimWorkspaceDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside aria-label={title} aria-modal="true" className="claim-drawer" role="dialog">
        <div className="section-heading">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          <button aria-label="Close claim workspace" className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
