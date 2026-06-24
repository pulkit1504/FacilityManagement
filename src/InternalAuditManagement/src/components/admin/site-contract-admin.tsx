"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Building2, CalendarPlus, Download, KeyRound, Loader2, MailCheck, Pencil, Plus, PowerOff, RotateCcw, Save, Trash2, Upload, UserPlus, X } from "lucide-react";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { getProblemMessage } from "@/components/ui/problem-message";

type Contract = {
  contractId: string;
  clientName: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
};

type Site = {
  siteId: string;
  siteName: string;
  siteAddress: string | null;
  serviceType: "Housekeeping" | "Security" | "Both";
  contractId: string | null;
  clientName: string | null;
  contractDescription: string | null;
  clusterHeadEmployeeId: string | null;
  clusterHeadName: string | null;
  isActive: boolean;
};

type Employee = {
  employeeId: string;
  fullName: string;
  email: string;
  role: "Claimant" | "ClusterHead" | "HOD" | "MD" | "Finance" | "BillingTeam" | "Auditor" | "Admin";
  directManagerId: string | null;
  isHod: boolean;
  approvalThresholdAmount: number;
  imprestAdvanceLimit: number;
  bankAccountHolderName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  passwordResetRequired: boolean;
  passwordUpdatedAt: string | null;
  isActive: boolean;
};

type ExpenseHead = {
  expenseHeadId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type Holiday = {
  holidayDate: string;
  holidayName: string;
  isNational: boolean;
};

type NotificationItem = {
  notificationId: string;
  recipientEmail: string;
  subject: string;
  relatedClaimId: string | null;
  status: "Queued" | "Sent" | "Failed";
  deliveryAttempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  providerMessageId: string | null;
  createdAt: string;
  sentAt: string | null;
};

type DeliveryHealth = {
  apiKeyConfigured: boolean;
  fromEmailConfigured: boolean;
  fromEmail: string | null;
  status: "Ready" | "Restricted" | "Invalid" | "NotConfigured";
  guidance: string;
};

const today = new Date().toISOString().slice(0, 10);
const roles: Employee["role"][] = ["Claimant", "ClusterHead", "HOD", "MD", "Finance", "BillingTeam", "Auditor", "Admin"];
type BulkUploadKind = "contracts" | "employees" | "sites" | "holidays";
type AdminSection = "setup" | "people" | "sites" | "notifications" | "retention";

const bulkTemplates: Record<BulkUploadKind, string> = {
  contracts: `clientName,description,startDate,endDate\nAcme Facilities,Annual facilities contract,2026-04-01,2027-03-31`,
  employees: `employeeId,fullName,email,role,directManagerId,isHod,approvalThresholdAmount,imprestAdvanceLimit,bankAccountHolderName,bankAccountNumber,bankIfsc,bankName,temporaryPassword\nEMP-1001,Asha Singh,asha@example.com,Claimant,EMP-2001,false,0,25000,Asha Singh,1234567890,HDFC0001234,HDFC Bank,ChangeMe123!`,
  sites: `siteName,siteAddress,serviceType,contractClientName,clusterHeadEmployeeId\nAcme Tower,MG Road Bengaluru,Both,Acme Facilities,EMP-2001`,
  holidays: `holidayDate,holidayName,isNational\n2026-08-15,Independence Day,true`
};

const adminSections: Array<{ id: AdminSection; label: string; description: string }> = [
  { id: "setup", label: "Setup", description: "Bulk upload, expense heads, and holidays" },
  { id: "people", label: "People", description: "Employees, roles, passwords, and bank data" },
  { id: "sites", label: "Sites", description: "Contracts, site status, and Cluster Head mapping" },
  { id: "notifications", label: "Mail Delivery", description: "Email health, retries, and history" },
  { id: "retention", label: "Retention", description: "Controlled cleanup for stale records" }
];

export function SiteContractAdmin() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [expenseHeads, setExpenseHeads] = useState<ExpenseHead[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<AdminSection>("setup");
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [editingExpenseHeadId, setEditingExpenseHeadId] = useState<string | null>(null);
  const [deliveryHealth, setDeliveryHealth] = useState<DeliveryHealth | null>(null);
  const [cleanupDays, setCleanupDays] = useState(90);
  const [cleanupConfirmed, setCleanupConfirmed] = useState(false);
  const [contractDraft, setContractDraft] = useState({
    clientName: "",
    description: "",
    startDate: today,
    endDate: ""
  });
  const [siteDraft, setSiteDraft] = useState({
    siteName: "",
    siteAddress: "",
    serviceType: "Both" as Site["serviceType"],
    contractId: "",
    clusterHeadEmployeeId: "",
    isActive: true
  });
  const [employeeDraft, setEmployeeDraft] = useState({
    employeeId: "",
    fullName: "",
    email: "",
    role: "Claimant" as Employee["role"],
    directManagerId: "",
    isHod: false,
    approvalThresholdAmount: 0,
    imprestAdvanceLimit: 0,
    bankAccountHolderName: "",
    bankAccountNumber: "",
    bankIfsc: "",
    bankName: "",
    temporaryPassword: ""
  });
  const [holidayDraft, setHolidayDraft] = useState({
    holidayDate: today,
    holidayName: "",
    isNational: true
  });
  const [expenseHeadDraft, setExpenseHeadDraft] = useState({
    name: "",
    description: "",
    isActive: true
  });
  const [passwordResetDraft, setPasswordResetDraft] = useState({
    employeeId: "",
    temporaryPassword: "",
    requirePasswordReset: true
  });

  const managerOptions = useMemo(
    () => employees.filter((employee) => ["ClusterHead", "HOD", "MD", "Finance", "Auditor"].includes(employee.role)),
    [employees]
  );
  const clusterHeadOptions = useMemo(
    () => employees.filter((employee) => employee.role === "ClusterHead"),
    [employees]
  );
  const employeeNames = useMemo(
    () => new Map(employees.map((employee) => [employee.employeeId, employee.fullName])),
    [employees]
  );
  const activeSites = sites.filter((site) => site.isActive !== false);
  const inactiveSites = sites.filter((site) => site.isActive === false);
  const sitesWithoutClusterHead = activeSites.filter((site) => !site.clusterHeadEmployeeId);
  const payableEmployeesWithoutBank = employees.filter(
    (employee) =>
      ["Claimant", "ClusterHead", "HOD"].includes(employee.role) &&
      !(employee.bankAccountHolderName && employee.bankAccountNumber && employee.bankIfsc && employee.bankName)
  );
  const failedNotifications = notifications.filter((item) => item.status === "Failed");
  async function load() {
    try {
      const [response, notificationsResponse] = await Promise.all([
        fetch("/api/v1/admin/master-data", { cache: "no-store" }),
        fetch("/api/v1/admin/notifications", { cache: "no-store" })
      ]);
      const data = await response.json();
      const notificationData = await notificationsResponse.json();
      if (!response.ok) {
        setMessage(getProblemMessage(data, "Could not load master data."));
        return;
      }
      setContracts(data.contracts ?? []);
      setSites(data.sites ?? []);
      setEmployees(data.employees ?? []);
      setHolidays(data.holidays ?? []);
      setExpenseHeads(data.expenseHeads ?? []);
      if (notificationsResponse.ok) {
        setNotifications(notificationData.items ?? []);
        setDeliveryHealth(notificationData.deliveryHealth ?? null);
      } else {
        setMessage(getProblemMessage(notificationData, "Master data loaded, but notification history could not be loaded."));
      }
      setSiteDraft((current) => ({ ...current, contractId: current.contractId || data.contracts?.[0]?.contractId || "" }));
      setPasswordResetDraft((current) => ({ ...current, employeeId: current.employeeId || data.employees?.[0]?.employeeId || "" }));
    } catch {
      setMessage("Could not load Admin data. Check your connection and access, then try again.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function postJson(path: string, payload: unknown, action: string, fallback: string) {
    setBusyAction(action);
    setMessage("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      setMessage(data.message ?? getProblemMessage(data, fallback));
      if (response.ok) {
        await load();
      }
      return response.ok;
    } catch {
      setMessage("Could not complete the update. Check your connection and try again.");
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function putJson(path: string, payload: unknown, action: string, fallback: string) {
    setBusyAction(action);
    setMessage("");
    try {
      const response = await fetch(path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      setMessage(data.message ?? getProblemMessage(data, fallback));
      if (response.ok) {
        await load();
      }
      return response.ok;
    } catch {
      setMessage("Could not complete the update. Check your connection and try again.");
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function bulkUpload(kind: BulkUploadKind, file: File | undefined) {
    if (!file) return;
    setBusyAction(`bulk:${kind}`);
    setMessage(`Uploading ${kind}...`);
    try {
      const rows = parseCsv(await file.text());
      if (rows.length === 0) throw new Error("The selected CSV has no data rows.");

      const endpoints: Record<BulkUploadKind, string> = {
        contracts: "/api/v1/admin/contracts",
        employees: "/api/v1/admin/employees",
        sites: "/api/v1/admin/sites",
        holidays: "/api/v1/admin/holidays"
      };
      const errors: string[] = [];
      let imported = 0;

      for (const [index, row] of rows.entries()) {
        try {
          const payload = bulkPayload(kind, row, contracts);
          const response = await fetch(endpoints[kind], {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const data = await response.json();
          if (response.ok) imported += 1;
          else errors.push(`Row ${index + 2}: ${getProblemMessage(data, "Import failed.")}`);
        } catch (error) {
          errors.push(`Row ${index + 2}: ${error instanceof Error ? error.message : "CSV row could not be read."}`);
        }
      }

      await load();
      setMessage(errors.length > 0
        ? `Imported ${imported} ${kind}. ${errors.length} row(s) failed: ${errors.slice(0, 3).join(" | ")}`
        : `Imported ${imported} ${kind} successfully.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not upload ${kind}.`);
    } finally {
      setBusyAction(null);
    }
  }

  async function createContract() {
    const saved = await postJson(
      "/api/v1/admin/contracts",
      {
        clientName: contractDraft.clientName,
        description: contractDraft.description || null,
        startDate: contractDraft.startDate,
        endDate: contractDraft.endDate || null
      },
      "contract:create",
      "Contract saved."
    );
    if (saved) {
      setContractDraft({ clientName: "", description: "", startDate: today, endDate: "" });
    }
  }

  async function saveSite() {
    const payload = {
      ...siteDraft,
      clusterHeadEmployeeId: siteDraft.clusterHeadEmployeeId || null
    };
    const saved = editingSiteId
      ? await putJson(
        `/api/v1/admin/sites/${editingSiteId}`,
        payload,
        "site:update",
        "Site saved."
      )
      : await postJson(
        "/api/v1/admin/sites",
        payload,
        "site:create",
        "Site saved."
      );
    if (saved) {
      resetSiteDraft();
    }
  }

  async function reactivateSite(site: Site) {
    if (!window.confirm(`Mark ${site.siteName} active and make it available for new claims?`)) return;
    await mutate(`/api/v1/admin/sites/${site.siteId}/reactivate`, "POST", `site:${site.siteId}:reactivate`, "Site marked active.");
  }

  async function createEmployee() {
    const saved = await postJson(
      "/api/v1/admin/employees",
      {
        ...employeeDraft,
        directManagerId: employeeDraft.directManagerId || null,
        isHod: employeeDraft.role === "HOD" || employeeDraft.isHod,
        bankAccountHolderName: employeeDraft.bankAccountHolderName || null,
        bankAccountNumber: employeeDraft.bankAccountNumber || null,
        bankIfsc: employeeDraft.bankIfsc || null,
        bankName: employeeDraft.bankName || null,
        temporaryPassword: employeeDraft.temporaryPassword || null
      },
      "employee:create",
      "Employee saved."
    );
    if (saved) {
      resetEmployeeDraft();
    }
  }

  async function createHoliday() {
    const saved = await postJson("/api/v1/admin/holidays", holidayDraft, "holiday:create", "Holiday saved.");
    if (saved) {
      setHolidayDraft({ holidayDate: today, holidayName: "", isNational: true });
    }
  }

  async function saveExpenseHead() {
    const payload = {
      name: expenseHeadDraft.name,
      description: expenseHeadDraft.description || null,
      isActive: expenseHeadDraft.isActive
    };
    const saved = editingExpenseHeadId
      ? await putJson(`/api/v1/admin/expense-heads/${editingExpenseHeadId}`, payload, "expense-head:update", "Expense head updated.")
      : await postJson("/api/v1/admin/expense-heads", payload, "expense-head:create", "Expense head saved.");
    if (saved) {
      resetExpenseHeadDraft();
    }
  }

  async function resetEmployeePassword() {
    const employee = employees.find((item) => item.employeeId === passwordResetDraft.employeeId);
    if (!employee || !window.confirm(`Set a temporary password for ${employee.fullName}?`)) return;
    const saved = await postJson(
      `/api/v1/admin/employees/${passwordResetDraft.employeeId}/password`,
      {
        temporaryPassword: passwordResetDraft.temporaryPassword,
        requirePasswordReset: passwordResetDraft.requirePasswordReset
      },
      "employee:password-reset",
      "Password reset."
    );
    if (saved) {
      setPasswordResetDraft((current) => ({ ...current, temporaryPassword: "", requirePasswordReset: true }));
    }
  }

  async function mutate(path: string, method: "POST" | "DELETE", action: string, fallback: string, confirmation?: string) {
    if (confirmation && !window.confirm(confirmation)) return;
    setBusyAction(action);
    setMessage("");
    try {
      const response = await fetch(path, { method });
      const data = await response.json();
      setMessage(data.message ?? getProblemMessage(data, fallback));
      if (response.ok) {
        await load();
      }
    } catch {
      setMessage("Could not complete the update. Check your connection and try again.");
    } finally {
      setBusyAction(null);
    }
  }

  async function deliverNotifications() {
    setBusyAction("notifications:deliver");
    setMessage("Delivering queued notifications...");
    try {
      const response = await fetch("/api/v1/admin/notifications", { method: "POST" });
      const data = await response.json();
      setMessage(data.message ?? getProblemMessage(data, "Notification delivery attempted."));
      if (response.ok) {
        await load();
      }
    } catch {
      setMessage("Could not deliver notifications. Check your connection and try again.");
    } finally {
      setBusyAction(null);
    }
  }

  async function cleanupStaleRecords() {
    setBusyAction("cleanup:stale");
    setMessage("Removing stale drafts and exhausted failed notifications...");
    try {
      const response = await fetch("/api/v1/admin/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ olderThanDays: cleanupDays })
      });
      const data = await response.json();
      setMessage(data.message ?? getProblemMessage(data, "Cleanup could not be completed."));
      if (response.ok) {
        setCleanupConfirmed(false);
        await load();
      }
    } catch {
      setMessage("Could not complete cleanup. Check your connection and try again.");
    } finally {
      setBusyAction(null);
    }
  }

  async function assignClusterHead(siteId: string, clusterHeadEmployeeId: string) {
    setBusyAction(`site-assign:${siteId}`);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/admin/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterHeadEmployeeId })
      });
      const data = await response.json();
      setMessage(data.message ?? getProblemMessage(data, "Could not update the site Cluster Head."));
      if (response.ok) await load();
    } catch {
      setMessage("Could not update the site Cluster Head. Check your connection and try again.");
    } finally {
      setBusyAction(null);
    }
  }

  function editEmployee(employee: Employee) {
    setEditingEmployeeId(employee.employeeId);
    setEmployeeDraft({
      employeeId: employee.employeeId,
      fullName: employee.fullName,
      email: employee.email,
      role: employee.role,
      directManagerId: employee.directManagerId ?? "",
      isHod: employee.isHod,
      approvalThresholdAmount: employee.approvalThresholdAmount,
      imprestAdvanceLimit: employee.imprestAdvanceLimit,
      bankAccountHolderName: employee.bankAccountHolderName ?? "",
      bankAccountNumber: employee.bankAccountNumber ?? "",
      bankIfsc: employee.bankIfsc ?? "",
      bankName: employee.bankName ?? "",
      temporaryPassword: ""
    });
    setMessage(`Editing ${employee.fullName}. Update the fields and select Save changes.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function editSite(site: Site) {
    setEditingSiteId(site.siteId);
    setSiteDraft({
      siteName: site.siteName,
      siteAddress: site.siteAddress ?? "",
      serviceType: site.serviceType,
      contractId: site.contractId ?? "",
      clusterHeadEmployeeId: site.clusterHeadEmployeeId ?? "",
      isActive: site.isActive !== false
    });
    setActiveSection("sites");
    setMessage(`Editing ${site.siteName}. Update the site details and select Save site.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetSiteDraft() {
    setEditingSiteId(null);
    setSiteDraft((current) => ({
      siteName: "",
      siteAddress: "",
      serviceType: "Both",
      contractId: contracts[0]?.contractId ?? current.contractId,
      clusterHeadEmployeeId: current.clusterHeadEmployeeId,
      isActive: true
    }));
  }

  function editExpenseHead(expenseHead: ExpenseHead) {
    setEditingExpenseHeadId(expenseHead.expenseHeadId);
    setExpenseHeadDraft({
      name: expenseHead.name,
      description: expenseHead.description ?? "",
      isActive: expenseHead.isActive
    });
    setMessage(`Editing expense head ${expenseHead.name}.`);
  }

  function resetExpenseHeadDraft() {
    setEditingExpenseHeadId(null);
    setExpenseHeadDraft({ name: "", description: "", isActive: true });
  }

  function resetEmployeeDraft() {
    setEditingEmployeeId(null);
    setEmployeeDraft({
      employeeId: "",
      fullName: "",
      email: "",
      role: "Claimant",
      directManagerId: "",
      isHod: false,
      approvalThresholdAmount: 0,
      imprestAdvanceLimit: 0,
      bankAccountHolderName: "",
      bankAccountNumber: "",
      bankIfsc: "",
      bankName: "",
      temporaryPassword: ""
    });
  }

  if (isLoading) {
    return (
      <section className="panel">
        <span className="loading-inline">
          <Loader2 size={16} />
          Loading master data...
        </span>
      </section>
    );
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <ActionFeedback message={message} onDismiss={() => setMessage("")} />

      <section className="panel admin-summary" aria-label="Admin setup summary">
        <button onClick={() => setActiveSection("people")} type="button"><strong>{employees.length}</strong><span>Active people</span></button>
        <button onClick={() => setActiveSection("sites")} type="button"><strong>{activeSites.length}</strong><span>Active sites</span></button>
        <button onClick={() => setActiveSection("sites")} type="button"><strong>{inactiveSites.length}</strong><span>Inactive sites</span></button>
        <button onClick={() => setActiveSection("sites")} type="button"><strong>{contracts.length}</strong><span>Contracts</span></button>
        <button onClick={() => setActiveSection("setup")} type="button"><strong>{expenseHeads.filter((head) => head.isActive).length}</strong><span>Expense heads</span></button>
        <button onClick={() => setActiveSection("notifications")} type="button"><strong>{notifications.filter((item) => item.status === "Queued").length}</strong><span>Queued notifications</span></button>
      </section>

      <section className="panel admin-workspace-nav" aria-label="Admin workspaces">
        {adminSections.map((section) => (
          <button
            aria-pressed={activeSection === section.id}
            className={activeSection === section.id ? "active" : ""}
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            type="button"
          >
            <strong>{section.label}</strong>
            <span>{section.description}</span>
          </button>
        ))}
      </section>

      {activeSection === "setup" ? (
        <>
      <section className="panel" aria-label="Bulk master data upload">
        <div className="section-heading">
          <div>
            <h2>Bulk Master Data Upload</h2>
            <p className="muted">Upload CSV files in this order: contracts, employees, sites, then holidays. The sample files are Excel-compatible.</p>
          </div>
        </div>
        <div className="grid cols-2">
          {(Object.keys(bulkTemplates) as BulkUploadKind[]).map((kind) => (
            <div className="audit-evidence-row" key={kind}>
              <div>
                <strong>{formatBulkKind(kind)}</strong>
                <p className="muted">Use the exact column headers from the sample file.</p>
              </div>
              <div className="actions">
                <a className="button secondary" download={`${kind}-bulk-upload-sample.csv`} href={`data:text/csv;charset=utf-8,${encodeURIComponent(bulkTemplates[kind])}`}>
                  <Download size={16} />
                  Sample CSV
                </a>
                <label className="button secondary">
                  {busyAction === `bulk:${kind}` ? <Loader2 size={16} /> : <Upload size={16} />}
                  Upload CSV
                  <input accept=".csv,text/csv" disabled={busyAction !== null} hidden onChange={(event) => void bulkUpload(kind, event.target.files?.[0])} type="file" />
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid cols-2">
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>{editingExpenseHeadId ? "Edit Expense Head" : "Add Expense Head"}</h2>
              <p className="muted">Controls the expense-head dropdown used while creating claim line items.</p>
            </div>
            {editingExpenseHeadId ? (
              <button className="button secondary" disabled={busyAction !== null} onClick={resetExpenseHeadDraft} type="button">
                <X size={16} />
                Cancel edit
              </button>
            ) : null}
          </div>
          <div className="grid">
            <label>
              <span className="muted">Expense head name</span>
              <input value={expenseHeadDraft.name} onChange={(event) => setExpenseHeadDraft({ ...expenseHeadDraft, name: event.target.value })} />
            </label>
            <label>
              <span className="muted">Description</span>
              <input value={expenseHeadDraft.description} onChange={(event) => setExpenseHeadDraft({ ...expenseHeadDraft, description: event.target.value })} />
            </label>
            <label className="checkbox-row">
              <input checked={expenseHeadDraft.isActive} onChange={(event) => setExpenseHeadDraft({ ...expenseHeadDraft, isActive: event.target.checked })} type="checkbox" />
              Active for new claims
            </label>
            <button className="button" disabled={busyAction !== null || !expenseHeadDraft.name.trim()} onClick={() => void saveExpenseHead()} type="button">
              {busyAction === "expense-head:create" || busyAction === "expense-head:update" ? <Loader2 size={18} /> : <Save size={18} />}
              {editingExpenseHeadId ? "Save expense head" : "Add expense head"}
            </button>
          </div>
        </section>
      </div>

      <section aria-label="Expense heads table" className="panel" tabIndex={0}>
        <h2>Expense Heads</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {expenseHeads.map((expenseHead) => (
              <tr className={editingExpenseHeadId === expenseHead.expenseHeadId ? "editing-row" : undefined} key={expenseHead.expenseHeadId}>
                <td><strong>{expenseHead.name}</strong></td>
                <td>{expenseHead.description ?? "No description"}</td>
                <td>
                  <span className={`badge ${expenseHead.isActive ? "success" : "warning"}`}>
                    {expenseHead.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td>{new Date(expenseHead.updatedAt).toLocaleString("en-IN")}</td>
                <td>
                  <div className="actions">
                    <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => editExpenseHead(expenseHead)} type="button">
                      <Pencil size={18} />
                      Edit
                    </button>
                    {expenseHead.isActive ? (
                      <button className="button danger" disabled={Boolean(busyAction)} onClick={() => void mutate(`/api/v1/admin/expense-heads/${expenseHead.expenseHeadId}/deactivate`, "POST", `expense-head:${expenseHead.expenseHeadId}`, "Expense head deactivated.", `Deactivate ${expenseHead.name}? Existing claims keep their saved text, but new claims will not show it.`)} type="button">
                        {busyAction === `expense-head:${expenseHead.expenseHeadId}` ? <Loader2 size={18} /> : <PowerOff size={18} />}
                        Deactivate
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {expenseHeads.length === 0 ? (
              <tr>
                <td colSpan={5}>No expense heads configured.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {(sitesWithoutClusterHead.length > 0 || payableEmployeesWithoutBank.length > 0 || failedNotifications.length > 0) ? (
        <section className="panel">
          <h2>Setup actions required</h2>
          <div className="grid cols-3">
            <div>
              <span className={`badge ${sitesWithoutClusterHead.length > 0 ? "danger" : "success"}`}>
                {sitesWithoutClusterHead.length} sites missing Cluster Head
              </span>
              <p className="muted">Claims may skip site-level routing until these sites are updated.</p>
            </div>
            <div>
              <span className={`badge ${payableEmployeesWithoutBank.length > 0 ? "danger" : "success"}`}>
                {payableEmployeesWithoutBank.length} payable employees missing bank details
              </span>
              <p className="muted">Finance payment release is blocked until beneficiary details are complete.</p>
            </div>
            <div>
              <span className={`badge ${failedNotifications.length > 0 ? "danger" : "success"}`}>
                {failedNotifications.length} failed notifications
              </span>
              <p className="muted">Verify the email sending domain and retry failed notifications.</p>
            </div>
          </div>
        </section>
      ) : null}
        </>
      ) : null}

      {activeSection === "sites" ? (
        <>
      <div className="grid cols-2">
        <section className="panel">
          <h2>Add Contract</h2>
          <div className="grid">
            <label>
              <span className="muted">Client name</span>
              <input value={contractDraft.clientName} onChange={(event) => setContractDraft({ ...contractDraft, clientName: event.target.value })} />
            </label>
            <label>
              <span className="muted">Description</span>
              <input value={contractDraft.description} onChange={(event) => setContractDraft({ ...contractDraft, description: event.target.value })} />
            </label>
            <div className="grid cols-2">
              <label>
                <span className="muted">Start date</span>
                <input type="date" value={contractDraft.startDate} onChange={(event) => setContractDraft({ ...contractDraft, startDate: event.target.value })} />
              </label>
              <label>
                <span className="muted">End date</span>
                <input type="date" value={contractDraft.endDate} onChange={(event) => setContractDraft({ ...contractDraft, endDate: event.target.value })} />
              </label>
            </div>
            <button className="button" disabled={busyAction !== null || !contractDraft.clientName || !contractDraft.startDate} onClick={() => void createContract()} type="button">
              {busyAction === "contract:create" ? <Loader2 size={18} /> : <Plus size={18} />}
              Add contract
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>{editingSiteId ? "Edit Site" : "Add Site"}</h2>
              <p className="muted">{editingSiteId ? `Updating ${siteDraft.siteName}` : "Create a site and map its operating owner."}</p>
            </div>
            {editingSiteId ? (
              <button className="button secondary" disabled={busyAction !== null} onClick={resetSiteDraft} type="button">
                <X size={16} />
                Cancel edit
              </button>
            ) : null}
          </div>
          <div className="grid">
            <label>
              <span className="muted">Site name</span>
              <input value={siteDraft.siteName} onChange={(event) => setSiteDraft({ ...siteDraft, siteName: event.target.value })} />
            </label>
            <label>
              <span className="muted">Address</span>
              <input value={siteDraft.siteAddress} onChange={(event) => setSiteDraft({ ...siteDraft, siteAddress: event.target.value })} />
            </label>
            <div className="grid cols-2">
              <label>
                <span className="muted">Service type</span>
                <select value={siteDraft.serviceType} onChange={(event) => setSiteDraft({ ...siteDraft, serviceType: event.target.value as Site["serviceType"] })}>
                  <option value="Both">Both</option>
                  <option value="Housekeeping">Housekeeping</option>
                  <option value="Security">Security</option>
                </select>
                <span className="muted">Approval follows the manager chain. Assign a Cluster Head to another Cluster Head to add a specific intermediate level.</span>
              </label>
              <label>
                <span className="muted">Contract</span>
                <select value={siteDraft.contractId} onChange={(event) => setSiteDraft({ ...siteDraft, contractId: event.target.value })}>
                  <option value="">Select contract</option>
                  {contracts.map((contract) => (
                    <option key={contract.contractId} value={contract.contractId}>
                      {contract.clientName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="muted">Cluster head</span>
                <select value={siteDraft.clusterHeadEmployeeId} onChange={(event) => setSiteDraft({ ...siteDraft, clusterHeadEmployeeId: event.target.value })}>
                  <option value="">No cluster head</option>
                  {clusterHeadOptions.map((employee) => (
                    <option key={employee.employeeId} value={employee.employeeId}>
                      {employee.fullName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="checkbox-row">
              <input checked={siteDraft.isActive} onChange={(event) => setSiteDraft({ ...siteDraft, isActive: event.target.checked })} type="checkbox" />
              Active for new claims
            </label>
            <button className="button" disabled={busyAction !== null || !siteDraft.siteName || !siteDraft.contractId || !siteDraft.clusterHeadEmployeeId} onClick={() => void saveSite()} type="button">
              {busyAction === "site:create" || busyAction === "site:update" ? <Loader2 size={18} /> : editingSiteId ? <Save size={18} /> : <Building2 size={18} />}
              {editingSiteId ? "Save site" : "Add site"}
            </button>
          </div>
        </section>
      </div>
        </>
      ) : null}

      {activeSection === "people" ? (
        <>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>User Login Access</h2>
            <p className="muted">Enable email login by setting or resetting an employee&apos;s temporary password.</p>
          </div>
        </div>
        <div className="grid cols-2">
          <label>
            <span className="muted">User</span>
            <select value={passwordResetDraft.employeeId} onChange={(event) => setPasswordResetDraft({ ...passwordResetDraft, employeeId: event.target.value })}>
              <option value="">Select user</option>
              {employees.map((employee) => (
                <option key={employee.employeeId} value={employee.employeeId}>
                  {employee.fullName} - {employee.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted">Temporary password</span>
            <input autoComplete="new-password" type="password" value={passwordResetDraft.temporaryPassword} onChange={(event) => setPasswordResetDraft({ ...passwordResetDraft, temporaryPassword: event.target.value })} />
          </label>
          <label className="checkbox-row">
            <input checked={passwordResetDraft.requirePasswordReset} onChange={(event) => setPasswordResetDraft({ ...passwordResetDraft, requirePasswordReset: event.target.checked })} type="checkbox" />
            Require password reset on next login
          </label>
          <button className="button" disabled={busyAction !== null || !passwordResetDraft.employeeId || passwordResetDraft.temporaryPassword.length < 8} onClick={() => void resetEmployeePassword()} type="button">
            {busyAction === "employee:password-reset" ? <Loader2 size={18} /> : <KeyRound size={18} />}
            Reset password
          </button>
        </div>
      </section>

      <div className="grid cols-2">
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>{editingEmployeeId ? "Edit Employee" : "Add Employee"}</h2>
              <p className="muted">{editingEmployeeId ? `Updating ${employeeDraft.fullName}` : "Create a user and assign workflow access."}</p>
            </div>
            {editingEmployeeId ? (
              <button className="button secondary" disabled={busyAction !== null} onClick={resetEmployeeDraft} type="button">
                <X size={16} />
                Cancel edit
              </button>
            ) : null}
          </div>
          <div className="grid">
            <div className="grid cols-2">
              <label>
                <RequiredLabel>Employee ID</RequiredLabel>
                <input aria-required="true" disabled={Boolean(editingEmployeeId)} required value={employeeDraft.employeeId} onChange={(event) => setEmployeeDraft({ ...employeeDraft, employeeId: event.target.value })} />
              </label>
              <label>
                <RequiredLabel>Role</RequiredLabel>
                <select aria-required="true" required value={employeeDraft.role} onChange={(event) => setEmployeeDraft({ ...employeeDraft, role: event.target.value as Employee["role"] })}>
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              <RequiredLabel>Full name</RequiredLabel>
              <input aria-required="true" required value={employeeDraft.fullName} onChange={(event) => setEmployeeDraft({ ...employeeDraft, fullName: event.target.value })} />
            </label>
            <label>
              <RequiredLabel>Email</RequiredLabel>
              <input aria-required="true" required type="email" value={employeeDraft.email} onChange={(event) => setEmployeeDraft({ ...employeeDraft, email: event.target.value })} />
            </label>
            <label>
              <span className="muted">Temporary password</span>
              <input type="password" value={employeeDraft.temporaryPassword} onChange={(event) => setEmployeeDraft({ ...employeeDraft, temporaryPassword: event.target.value })} />
            </label>
            <div className="grid cols-2">
              <label>
                <span className="muted">Direct manager</span>
                <select value={employeeDraft.directManagerId} onChange={(event) => setEmployeeDraft({ ...employeeDraft, directManagerId: event.target.value })}>
                  <option value="">No manager</option>
                  {managerOptions.map((employee) => (
                    <option key={employee.employeeId} value={employee.employeeId}>
                      {employee.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="muted">Threshold</span>
                <input type="number" min="0" value={employeeDraft.approvalThresholdAmount} onChange={(event) => setEmployeeDraft({ ...employeeDraft, approvalThresholdAmount: Number(event.target.value) })} />
              </label>
            </div>
            <label>
              <span className="muted">Imprest advance limit</span>
              <input type="number" min="0" value={employeeDraft.imprestAdvanceLimit} onChange={(event) => setEmployeeDraft({ ...employeeDraft, imprestAdvanceLimit: Number(event.target.value) })} />
            </label>
            <div className="grid cols-2">
              <label>
                <span className="muted">Account holder</span>
                <input value={employeeDraft.bankAccountHolderName} onChange={(event) => setEmployeeDraft({ ...employeeDraft, bankAccountHolderName: event.target.value })} />
              </label>
              <label>
                <span className="muted">Bank name</span>
                <input value={employeeDraft.bankName} onChange={(event) => setEmployeeDraft({ ...employeeDraft, bankName: event.target.value })} />
              </label>
              <label>
                <span className="muted">Account number</span>
                <input value={employeeDraft.bankAccountNumber} onChange={(event) => setEmployeeDraft({ ...employeeDraft, bankAccountNumber: event.target.value })} />
              </label>
              <label>
                <span className="muted">IFSC</span>
                <input value={employeeDraft.bankIfsc} onChange={(event) => setEmployeeDraft({ ...employeeDraft, bankIfsc: event.target.value.toUpperCase() })} />
              </label>
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={employeeDraft.isHod || employeeDraft.role === "HOD"} onChange={(event) => setEmployeeDraft({ ...employeeDraft, isHod: event.target.checked })} />
              HOD approver
            </label>
            <button className="button" disabled={busyAction !== null || !employeeDraft.employeeId || !employeeDraft.fullName || !employeeDraft.email} onClick={() => void createEmployee()} type="button">
              {busyAction === "employee:create" ? <Loader2 size={18} /> : editingEmployeeId ? <Save size={18} /> : <UserPlus size={18} />}
              {editingEmployeeId ? "Save changes" : "Create employee"}
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Add Holiday</h2>
          <div className="grid">
            <label>
              <span className="muted">Date</span>
              <input type="date" value={holidayDraft.holidayDate} onChange={(event) => setHolidayDraft({ ...holidayDraft, holidayDate: event.target.value })} />
            </label>
            <label>
              <span className="muted">Holiday name</span>
              <input value={holidayDraft.holidayName} onChange={(event) => setHolidayDraft({ ...holidayDraft, holidayName: event.target.value })} />
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={holidayDraft.isNational} onChange={(event) => setHolidayDraft({ ...holidayDraft, isNational: event.target.checked })} />
              National holiday
            </label>
            <button className="button" disabled={busyAction !== null || !holidayDraft.holidayDate || !holidayDraft.holidayName} onClick={() => void createHoliday()} type="button">
              {busyAction === "holiday:create" ? <Loader2 size={18} /> : <CalendarPlus size={18} />}
              Save holiday
            </button>
          </div>
        </section>
      </div>

      <section aria-label="Employees and approvers table" className="panel" tabIndex={0}>
        <h2>Employees and Approvers</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Role</th>
              <th>Manager</th>
              <th>Threshold</th>
              <th>Imprest Limit</th>
              <th>Login</th>
              <th>Bank</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr className={editingEmployeeId === employee.employeeId ? "editing-row" : undefined} key={employee.employeeId}>
                <td>
                  <strong>{employee.fullName}</strong>
                  <br />
                  <span className="muted">{employee.employeeId} - {employee.email}</span>
                </td>
                <td>{employee.role}{employee.isHod ? " / HOD" : ""}</td>
                <td>{employee.directManagerId ? employeeNames.get(employee.directManagerId) ?? employee.directManagerId : "No manager"}</td>
                <td>{employee.approvalThresholdAmount.toLocaleString()}</td>
                <td>{employee.imprestAdvanceLimit.toLocaleString()}</td>
                <td>
                  <span className={`badge ${employee.passwordResetRequired ? "warning" : employee.passwordUpdatedAt ? "success" : "warning"}`}>
                    {employee.passwordResetRequired ? "Reset required" : employee.passwordUpdatedAt ? "Login enabled" : "No password set"}
                  </span>
                  <br />
                  <span className="muted">{employee.passwordUpdatedAt ? new Date(employee.passwordUpdatedAt).toLocaleDateString("en-IN") : "Set a temporary password"}</span>
                </td>
                <td>
                  {employee.bankName ?? "Not captured"}
                  <br />
                  <span className="muted">{employee.bankAccountNumber ? `Account ${maskAccount(employee.bankAccountNumber)}` : "No account"}</span>
                </td>
                <td>
                  <div className="actions">
                    <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => editEmployee(employee)} type="button">
                      <Pencil size={18} />
                      Edit
                    </button>
                    <button className="button danger" disabled={Boolean(busyAction)} onClick={() => void mutate(`/api/v1/admin/employees/${employee.employeeId}/deactivate`, "POST", `employee:${employee.employeeId}`, "Employee updated.", `Mark ${employee.fullName} inactive? They will lose application access.`)} type="button">
                      {busyAction === `employee:${employee.employeeId}` ? <Loader2 size={18} /> : <PowerOff size={18} />}
                      Mark inactive
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {employees.length === 0 ? (
              <tr>
                <td colSpan={8}>No active employees found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section aria-label="Holidays table" className="panel" tabIndex={0}>
        <h2>Holidays</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Name</th>
              <th>Type</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {holidays.map((holiday) => (
              <tr key={holiday.holidayDate}>
                <td>{holiday.holidayDate}</td>
                <td>{holiday.holidayName}</td>
                <td>{holiday.isNational ? "National" : "Local"}</td>
                <td>
                  <button className="button danger" disabled={Boolean(busyAction)} onClick={() => void mutate(`/api/v1/admin/holidays/${holiday.holidayDate}`, "DELETE", `holiday:${holiday.holidayDate}`, "Holiday removed.", `Remove ${holiday.holidayName} from the holiday calendar?`)} type="button">
                    {busyAction === `holiday:${holiday.holidayDate}` ? <Loader2 size={18} /> : <X size={18} />}
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {holidays.length === 0 ? (
              <tr>
                <td colSpan={4}>No holidays configured.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
        </>
      ) : null}

      {activeSection === "notifications" ? (
      <section aria-label="Notification delivery table" className="panel" tabIndex={0}>
        <div className="topbar" style={{ marginBottom: 12 }}>
          <h2>Notification Delivery</h2>
          <button className="button secondary" disabled={busyAction !== null} onClick={() => void deliverNotifications()} type="button">
            {busyAction === "notifications:deliver" ? <Loader2 size={18} /> : <MailCheck size={18} />}
            Deliver queued
          </button>
        </div>
        <div className="admin-health-grid">
          <div className="admin-health-card">
            <span className={`badge ${deliveryHealth?.apiKeyConfigured ? "success" : "danger"}`}>
              {deliveryHealth?.apiKeyConfigured ? "API key configured" : "API key missing"}
            </span>
            <strong>Resend API key</strong>
            <span className="muted">Secret: Resend-ApiKey</span>
          </div>
          <div className="admin-health-card">
            <span className={`badge ${deliveryHealth?.fromEmailConfigured ? "success" : "danger"}`}>
              {deliveryHealth?.fromEmailConfigured ? "Sender configured" : "Sender missing"}
            </span>
            <strong>From address</strong>
            <span className="muted">{deliveryHealth?.fromEmail ?? "Secret: Notification-FromEmail"}</span>
          </div>
          <div className="admin-health-card wide">
            <span className={`badge ${deliveryHealth?.status === "Ready" ? "success" : "danger"}`}>
              {deliveryHealth?.status ?? "Unknown"}
            </span>
            <strong>Delivery guidance</strong>
            <span className="muted">{deliveryHealth?.guidance ?? "Load notification history to inspect email delivery health."}</span>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Recipient</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Claim</th>
              <th>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {notifications.map((notification) => (
              <tr key={notification.notificationId}>
                <td>{notification.recipientEmail}</td>
                <td>
                  {notification.subject}
                  {notification.lastError ? (
                    <>
                      <br />
                      <span className="muted">{notification.lastError}</span>
                    </>
                  ) : null}
                </td>
                <td>
                  <span className={`badge ${notification.status === "Sent" ? "success" : notification.status === "Failed" ? "danger" : "warning"}`}>
                    {notification.status}
                  </span>
                </td>
                <td>{notification.deliveryAttempts}</td>
                <td>{notification.relatedClaimId ?? "N/A"}</td>
                <td>{new Date(notification.sentAt ?? notification.lastAttemptAt ?? notification.createdAt).toLocaleString("en-IN")}</td>
              </tr>
            ))}
            {notifications.length === 0 ? (
              <tr>
                <td colSpan={6}>No notifications found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
      ) : null}

      {activeSection === "retention" ? (
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Data Retention Cleanup</h2>
            <p className="muted">Removes unsubmitted drafts and failed notifications that exhausted all three delivery attempts. Paid claims and audit history are never removed.</p>
          </div>
          <div className="actions">
            <label>
              <span className="muted">Older than</span>
              <select disabled={Boolean(busyAction)} onChange={(event) => {
                setCleanupDays(Number(event.target.value));
                setCleanupConfirmed(false);
              }} value={cleanupDays}>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>365 days</option>
              </select>
            </label>
            <label className="checkbox-row">
              <input checked={cleanupConfirmed} disabled={Boolean(busyAction)} onChange={(event) => setCleanupConfirmed(event.target.checked)} type="checkbox" />
              I understand these stale records will be removed
            </label>
            <button className="button danger" disabled={Boolean(busyAction) || !cleanupConfirmed} onClick={() => void cleanupStaleRecords()} type="button">
              {busyAction === "cleanup:stale" ? <Loader2 size={18} /> : <Trash2 size={18} />}
              Remove stale records
            </button>
          </div>
        </div>
      </section>
      ) : null}

      {activeSection === "sites" ? (
      <section aria-label="Sites table" className="panel" tabIndex={0}>
        <h2>Sites</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Site</th>
              <th>Client / Contract</th>
              <th>Service</th>
              <th>Cluster Head</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((site) => (
              <tr className={editingSiteId === site.siteId ? "editing-row" : undefined} key={site.siteId}>
                <td>
                  <strong>{site.siteName}</strong>
                  <br />
                  <span className="muted">{site.siteAddress ?? "No address captured"}</span>
                </td>
                <td>
                  {site.clientName ?? "No client linked"}
                  <br />
                  <span className="muted">{site.contractDescription ?? site.contractId ?? "No contract description"}</span>
                </td>
                <td>{site.serviceType}</td>
                <td>
                  <select
                    aria-label={`Cluster Head for ${site.siteName}`}
                    disabled={Boolean(busyAction)}
                    onChange={(event) => void assignClusterHead(site.siteId, event.target.value)}
                    value={site.clusterHeadEmployeeId ?? ""}
                  >
                    <option value="">Not mapped</option>
                    {clusterHeadOptions.map((employee) => (
                      <option key={employee.employeeId} value={employee.employeeId}>{employee.fullName}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <span className={`badge ${site.isActive !== false ? "success" : "warning"}`}>
                    {site.isActive !== false ? "Active" : "Inactive"}
                  </span>
                </td>
                <td>
                  <div className="actions">
                    <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => editSite(site)} type="button">
                      <Pencil size={18} />
                      Edit
                    </button>
                    {site.isActive !== false ? (
                      <button className="button danger" disabled={Boolean(busyAction)} onClick={() => void mutate(`/api/v1/admin/sites/${site.siteId}/deactivate`, "POST", `site:${site.siteId}`, "Site updated.", `Mark ${site.siteName} inactive? It will no longer be available for new claims.`)} type="button">
                        {busyAction === `site:${site.siteId}` ? <Loader2 size={18} /> : <PowerOff size={18} />}
                        Mark inactive
                      </button>
                    ) : (
                      <button className="button" disabled={Boolean(busyAction) || !site.contractId || !site.clusterHeadEmployeeId} onClick={() => void reactivateSite(site)} title={!site.contractId || !site.clusterHeadEmployeeId ? "Add a contract and Cluster Head before reactivating" : "Mark site active"} type="button">
                        {busyAction === `site:${site.siteId}:reactivate` ? <Loader2 size={18} /> : <RotateCcw size={18} />}
                        Mark active
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {sites.length === 0 ? (
              <tr>
                <td colSpan={6}>No sites found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
      ) : null}
    </div>
  );
}

function RequiredLabel({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className="muted">
      {children}
      <span aria-hidden="true" className="required-mark"> *</span>
    </span>
  );
}

function maskAccount(value: string) {
  if (value.length <= 4) return value;
  return `****${value.slice(-4)}`;
}

function formatBulkKind(kind: BulkUploadKind) {
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
}

function bulkPayload(kind: BulkUploadKind, row: Record<string, string>, contracts: Contract[]) {
  if (kind === "contracts") {
    return {
      clientName: cell(row, "clientName", "client name", "client", "customer name"),
      description: optionalCell(row, "description", "contract description", "details"),
      startDate: toIsoDate(cell(row, "startDate", "start date", "contract start date"), "startDate"),
      endDate: optionalDate(row, "endDate", "end date", "contract end date")
    };
  }
  if (kind === "sites") {
    const contractClientName = cell(row, "contractClientName", "contract client name", "clientName", "client name", "client");
    const contract = contracts.find((item) => item.clientName.trim().toLowerCase() === contractClientName.trim().toLowerCase());
    if (!contract) throw new Error(`Contract client "${contractClientName}" was not found. Upload contracts first.`);
    return {
      siteName: cell(row, "siteName", "site name", "site"),
      siteAddress: optionalCell(row, "siteAddress", "site address", "address"),
      serviceType: cell(row, "serviceType", "service type"),
      contractId: contract.contractId,
      clusterHeadEmployeeId: cell(row, "clusterHeadEmployeeId", "cluster head employee id", "cluster head id")
    };
  }
  if (kind === "holidays") {
    return {
      holidayDate: toIsoDate(cell(row, "holidayDate", "holiday date", "date"), "holidayDate"),
      holidayName: cell(row, "holidayName", "holiday name", "name"),
      isNational: toBoolean(optionalCell(row, "isNational", "is national", "national") ?? "")
    };
  }
  return {
    employeeId: cell(row, "employeeId", "employee id"),
    fullName: cell(row, "fullName", "full name", "name"),
    email: cell(row, "email", "email address"),
    role: cell(row, "role"),
    directManagerId: optionalCell(row, "directManagerId", "direct manager id", "manager id"),
    isHod: toBoolean(optionalCell(row, "isHod", "is hod", "hod") ?? ""),
    approvalThresholdAmount: Number(optionalCell(row, "approvalThresholdAmount", "approval threshold amount", "threshold") || 0),
    imprestAdvanceLimit: Number(optionalCell(row, "imprestAdvanceLimit", "imprest advance limit", "advance limit") || 0),
    bankAccountHolderName: optionalCell(row, "bankAccountHolderName", "bank account holder name", "account holder"),
    bankAccountNumber: optionalCell(row, "bankAccountNumber", "bank account number", "account number"),
    bankIfsc: optionalCell(row, "bankIfsc", "bank ifsc", "ifsc"),
    bankName: optionalCell(row, "bankName", "bank name"),
    temporaryPassword: optionalCell(row, "temporaryPassword", "temporary password")
  };
}

function toBoolean(value: string) {
  return ["true", "yes", "1"].includes(value.trim().toLowerCase());
}

function cell(row: Record<string, string>, ...names: string[]) {
  const value = optionalCell(row, ...names);
  if (value) return value;
  throw new Error(`Missing required column value: ${names[0]}.`);
}

function optionalCell(row: Record<string, string>, ...names: string[]) {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [normalizeColumn(key), value.trim()]));
  for (const name of names) {
    const value = normalized.get(normalizeColumn(name));
    if (value) return value;
  }
  return null;
}

function normalizeColumn(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function optionalDate(row: Record<string, string>, ...names: string[]) {
  const value = optionalCell(row, ...names);
  return value ? toIsoDate(value, names[0]) : null;
}

function toIsoDate(value: string, fieldName: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const separated = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (separated) {
    const [, first, second, year] = separated;
    const firstNumber = Number(first);
    const secondNumber = Number(second);
    const dayFirst = secondNumber <= 12 || firstNumber > 12;
    const day = dayFirst ? firstNumber : secondNumber;
    const month = dayFirst ? secondNumber : firstNumber;
    return formatIsoDate(Number(year), month, day, fieldName);
  }

  if (/^\d{5,6}$/.test(trimmed)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + Number(trimmed) * 24 * 60 * 60 * 1000);
    return formatIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), fieldName);
  }

  throw new Error(`Invalid ${fieldName}. Use YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, or an Excel date serial.`);
}

function formatIsoDate(year: number, month: number, day: number, fieldName: string) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Invalid ${fieldName}. Check the day and month values.`);
  }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("CSV format error: a quoted value is not closed. Check quotation marks in the uploaded file.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);

  const headers = (rows.shift() ?? []).map((header) => header.replace(/^\uFEFF/, "").trim());
  if (headers.length === 0) throw new Error("CSV header row is missing.");
  const blankHeaderIndex = headers.findIndex((header) => !header);
  if (blankHeaderIndex >= 0) {
    throw new Error(`CSV format error: column ${blankHeaderIndex + 1} has a blank header.`);
  }
  const seenHeaders = new Set<string>();
  for (const header of headers) {
    const normalized = normalizeColumn(header);
    if (seenHeaders.has(normalized)) {
      throw new Error(`CSV format error: duplicate column "${header}".`);
    }
    seenHeaders.add(normalized);
  }
  const invalidRow = rows.findIndex((values) => values.length > headers.length);
  if (invalidRow >= 0) {
    throw new Error(`CSV format error: row ${invalidRow + 2} has more values than the header row. Check extra commas or quotes.`);
  }
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}
