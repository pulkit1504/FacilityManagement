"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Save } from "lucide-react";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { getProblemMessage } from "@/components/ui/problem-message";

type Employee = {
  employeeId: string;
  fullName: string;
  email: string;
  role: string;
  bankAccountHolderName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  passwordResetRequired?: boolean;
};

type Site = { siteId: string; siteName: string; clientName: string | null };

export function EmployeeProfile() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [linkedEmployees, setLinkedEmployees] = useState<Employee[]>([]);
  const [linkedSites, setLinkedSites] = useState<Site[]>([]);
  const [bank, setBank] = useState({ bankAccountHolderName: "", bankAccountNumber: "", bankIfsc: "", bankName: "" });
  const [password, setPassword] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [message, setMessage] = useState("");
  const [bankBusy, setBankBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/v1/profile", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setMessage(getProblemMessage(data, "Could not load your profile."));
      return;
    }
    setEmployee(data.employee);
    setLinkedEmployees(data.linkedEmployees ?? []);
    setLinkedSites(data.linkedSites ?? []);
    setBank({
      bankAccountHolderName: data.employee.bankAccountHolderName ?? "",
      bankAccountNumber: data.employee.bankAccountNumber ?? "",
      bankIfsc: data.employee.bankIfsc ?? "",
      bankName: data.employee.bankName ?? ""
    });
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveBankDetails() {
    setBankBusy(true);
    try {
      const response = await fetch("/api/v1/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bank)
      });
      const data = await response.json();
      setMessage(data.message ?? getProblemMessage(data, "Could not update bank details."));
      if (response.ok) setEmployee(data.employee);
    } finally {
      setBankBusy(false);
    }
  }

  async function changePassword() {
    setPasswordBusy(true);
    try {
      const response = await fetch("/api/v1/profile/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(password)
      });
      const data = await response.json();
      setMessage(data.message ?? getProblemMessage(data, "Could not change password."));
      if (response.ok) {
        setEmployee(data.employee);
        setPassword({ currentPassword: "", newPassword: "", confirmPassword: "" });
      }
    } finally {
      setPasswordBusy(false);
    }
  }

  if (!employee) {
    return <section className="panel"><span className="loading-inline"><Loader2 size={16} /> Loading profile...</span><ActionFeedback message={message} /></section>;
  }

  const canManageBankDetails = ["Claimant", "ClusterHead", "HOD"].includes(employee.role);
  const passwordReady = password.currentPassword.length > 0 && password.newPassword.length >= 8 && password.confirmPassword.length > 0;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <section className="panel">
        <h2>{employee.fullName}</h2>
        <p className="muted">{employee.role} · {employee.email} · {employee.employeeId}</p>
        {employee.passwordResetRequired ? <p className="badge warning">Temporary password active. Change it before continuing regular work.</p> : null}
        <ActionFeedback message={message} onDismiss={() => setMessage("")} />
      </section>
      <section className="panel">
        <h2>Change password</h2>
        <div className="grid cols-3">
          <label><span className="muted">Current password</span><input autoComplete="current-password" type="password" value={password.currentPassword} onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })} /></label>
          <label><span className="muted">New password</span><input autoComplete="new-password" type="password" value={password.newPassword} onChange={(event) => setPassword({ ...password, newPassword: event.target.value })} /></label>
          <label><span className="muted">Confirm new password</span><input autoComplete="new-password" type="password" value={password.confirmPassword} onChange={(event) => setPassword({ ...password, confirmPassword: event.target.value })} /></label>
        </div>
        <button className="button" disabled={passwordBusy || !passwordReady} onClick={() => void changePassword()} style={{ marginTop: 12 }} type="button">
          {passwordBusy ? <Loader2 size={16} /> : <KeyRound size={16} />} Change password
        </button>
      </section>
      {canManageBankDetails ? (
        <section className="panel">
          <h2>Bank details</h2>
          <div className="grid cols-2">
            <label><span className="muted">Account holder</span><input value={bank.bankAccountHolderName} onChange={(event) => setBank({ ...bank, bankAccountHolderName: event.target.value })} /></label>
            <label><span className="muted">Bank name</span><input value={bank.bankName} onChange={(event) => setBank({ ...bank, bankName: event.target.value })} /></label>
            <label><span className="muted">Account number</span><input value={bank.bankAccountNumber} onChange={(event) => setBank({ ...bank, bankAccountNumber: event.target.value })} /></label>
            <label><span className="muted">IFSC</span><input value={bank.bankIfsc} onChange={(event) => setBank({ ...bank, bankIfsc: event.target.value.toUpperCase() })} /></label>
          </div>
          <button className="button" disabled={bankBusy || Object.values(bank).some((value) => value.trim().length < 2)} onClick={() => void saveBankDetails()} style={{ marginTop: 12 }} type="button">
            {bankBusy ? <Loader2 size={16} /> : <Save size={16} />} Save bank details
          </button>
        </section>
      ) : null}
      <section className="panel">
        <h2>Linked sites</h2>
        <div className="actions">{linkedSites.map((site) => <span className="badge success" key={site.siteId}>{site.siteName}{site.clientName ? ` · ${site.clientName}` : ""}</span>)}</div>
        {linkedSites.length === 0 ? <p className="muted">No sites are currently linked to your profile.</p> : null}
      </section>
      <section className="panel">
        <h2>Linked employees</h2>
        <div className="actions">{linkedEmployees.map((item) => <span className="badge warning" key={item.employeeId}>{item.fullName} · {item.role}</span>)}</div>
        {linkedEmployees.length === 0 ? <p className="muted">No employees report directly to you.</p> : null}
      </section>
    </div>
  );
}
