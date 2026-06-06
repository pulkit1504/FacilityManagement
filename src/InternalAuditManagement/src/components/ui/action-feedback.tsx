"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export type FeedbackTone = "error" | "info" | "success";

type ActionFeedbackProps = {
  message: string;
  onDismiss?: () => void;
  tone?: FeedbackTone;
};

export function ActionFeedback({ message, onDismiss, tone = inferTone(message) }: Readonly<ActionFeedbackProps>) {
  if (!message) return null;

  const Icon = tone === "error" ? AlertCircle : tone === "success" ? CheckCircle2 : Info;

  return (
    <div className={`feedback ${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon aria-hidden="true" size={20} />
      <span>{message}</span>
      {onDismiss ? (
        <button aria-label="Dismiss message" className="feedback-dismiss" onClick={onDismiss} type="button">
          <X size={16} />
        </button>
      ) : null}
    </div>
  );
}

function inferTone(message: string): FeedbackTone {
  const normalized = message.toLowerCase();
  if (
    ["could not", "failed", "error", "required", "enter ", "invalid", "unable", "not allowed", "denied"].some((term) =>
      normalized.includes(term)
    )
  ) {
    return "error";
  }
  if (
    ["saved", "updated", "complete", "submitted", "attached", "confirmed", "released", "removed", "reopened", "signed in"].some(
      (term) => normalized.includes(term)
    )
  ) {
    return "success";
  }
  return "info";
}
