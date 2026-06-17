"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Loader2 } from "lucide-react";

type NotificationItem = {
  notificationId: string;
  subject: string;
  body: string;
  relatedClaimId: string | null;
  status: "Queued" | "Sent" | "Failed";
  createdAt: string;
  sentAt: string | null;
};

export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || items.length > 0) return;
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      try {
        const response = await fetch("/api/v1/notifications", { cache: "no-store" });
        const data = await response.json();
        if (response.ok && isMounted) {
          setItems(data.items ?? []);
          setUnreadCount(data.unreadCount ?? 0);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, [isOpen, items.length]);

  return (
    <div className="notification-bell">
      <button aria-expanded={isOpen} aria-label="Open notification center" className="icon-button notification-bell-button" onClick={() => setIsOpen((current) => !current)} type="button">
        {isLoading ? <Loader2 size={18} /> : <Bell size={18} />}
        {unreadCount > 0 ? <span className="notification-count">{unreadCount}</span> : null}
      </button>
      {isOpen ? (
        <div className="notification-popover">
          <div className="section-heading">
            <div>
              <h3>Notification Center</h3>
              <p className="muted">Claim returns, approvals, audit requests, voucher updates, payments, and billing alerts.</p>
            </div>
          </div>
          <div className="notification-list">
            {items.map((item) => (
              <Link className="notification-item" href={item.relatedClaimId ? `?claim=${item.relatedClaimId}` : "#"} key={item.notificationId}>
                <Bell size={16} />
                <div>
                  <strong>{item.subject}</strong>
                  <span>{item.body}</span>
                  <small>{item.status} | {formatTimestamp(item.sentAt ?? item.createdAt)}</small>
                </div>
              </Link>
            ))}
            {!isLoading && items.length === 0 ? <p className="muted">No notifications yet.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  }).format(new Date(value));
}
