"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, CalendarPlus, Loader2, MailCheck, Pencil, Plus, PowerOff, Save, UserPlus, X } from "lucide-react";
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
};

type Employee = {
  employeeId: string;
  fullName: string;
  email: string;
  role: "Claimant" | "ClusterHead" | "HOD" | "MD" | "Finance" | "BillingTeam" | "FinanceHOD" | "Admin";
  directManagerId: string | null;
  isHod: boolean;
  approvalThresholdAmount: number;
  imprestAdvanceLimit: number;
  bankAccountHolderName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  isActive: boolean;
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

const today = new Date().toISOString().slice(0, 10);
const roles: Employee["role"][] = ["Claimant", "ClusterHead", "HOD", "MD", "Finance", "BillingTeam", "FinanceHOD", "Admin"];

export function SiteContractAdmin() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
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
    clusterHeadEmployeeId: ""
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

  const managerOptions = useMemo(
    () => employees.filter((employee) => ["ClusterHead", "HOD", "MD", "FinanceHOD", "Finance"].includes(employee.role)),
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
  const sitesWithoutClusterHead = sites.filter((site) => !site.clusterHeadEmployeeId);
  const payableEmployeesWithoutBank = employees.filter(
    (employee) =>
      ["Claimant", "ClusterHead", "HOD"].includes(employee.role) &&
      !(employee.bankAccountHolderName && employee.bankAccountNumber && employee.bankIfsc && employee.bankName)
  );
  const failedNotifications = notifications.filter((item) => item.status === "Failed");
  const employeeBankReady =
    !["Claimant", "ClusterHead", "HOD"].includes(employeeDraft.role) ||
    Boolean(employeeDraft.bankAccountHolderName && employeeDraft.bankAccountNumber && employeeDraft.bankIfsc && employeeDraft.bankName);

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
      if (notificationsResponse.ok) {
        setNotifications(notificationData.items ?? []);
      } else {
        setMessage(getProblemMessage(notificationData, "Master data loaded, but notification history could not be loaded."));
      }
      setSiteDraft((current) => ({ ...current, contractId: current.contractId || data.contracts?.[0]?.contractId || "" }));
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

  async function createSite() {
    const saved = await postJson(
      "/api/v1/admin/sites",
      {
        ...siteDraft,
        clusterHeadEmployeeId: siteDraft.clusterHeadEmployeeId || null
      },
      "site:create",
      "Site saved."
    );
    if (saved) {
      setSiteDraft((current) => ({ siteName: "", siteAddress: "", serviceType: "Both", contractId: current.contractId, clusterHeadEmployeeId: current.clusterHeadEmployeeId }));
    }
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
        <div><strong>{employees.length}</strong><span>Active people</span></div>
        <div><strong>{sites.length}</strong><span>Active sites</span></div>
        <div><strong>{contracts.length}</strong><span>Contracts</span></div>
        <div><strong>{notifications.filter((item) => item.status === "Queued").length}</strong><span>Queued notifications</span></div>
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
          <h2>Add Site</h2>
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
            <button className="button" disabled={busyAction !== null || !siteDraft.siteName || !siteDraft.contractId || !siteDraft.clusterHeadEmployeeId} onClick={() => void createSite()} type="button">
              {busyAction === "site:create" ? <Loader2 size={18} /> : <Building2 size={18} />}
              Add site
            </button>
          </div>
        </section>
      </div>

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
                <span className="muted">Employee ID</span>
                <input disabled={Boolean(editingEmployeeId)} value={employeeDraft.employeeId} onChange={(event) => setEmployeeDraft({ ...employeeDraft, employeeId: event.target.value })} />
              </label>
              <label>
                <span className="muted">Role</span>
                <select value={employeeDraft.role} onChange={(event) => setEmployeeDraft({ ...employeeDraft, role: event.target.value as Employee["role"] })}>
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              <span className="muted">Full name</span>
              <input value={employeeDraft.fullName} onChange={(event) => setEmployeeDraft({ ...employeeDraft, fullName: event.target.value })} />
            </label>
            <label>
              <span className="muted">Email</span>
              <input type="email" value={employeeDraft.email} onChange={(event) => setEmployeeDraft({ ...employeeDraft, email: event.target.value })} />
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
            <button className="button" disabled={busyAction !== null || !employeeDraft.employeeId || !employeeDraft.fullName || !employeeDraft.email || !employeeBankReady} onClick={() => void createEmployee()} type="button">
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

      <section className="panel">
        <h2>Employees and Approvers</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Role</th>
              <th>Manager</th>
              <th>Threshold</th>
              <th>Imprest Limit</th>
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
                <td colSpan={7}>No active employees found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="panel">
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

      <section className="panel">
        <div className="topbar" style={{ marginBottom: 12 }}>
          <h2>Notification Delivery</h2>
          <button className="button secondary" disabled={busyAction !== null} onClick={() => void deliverNotifications()} type="button">
            {busyAction === "notifications:deliver" ? <Loader2 size={18} /> : <MailCheck size={18} />}
            Deliver queued
          </button>
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

      <section className="panel">
        <h2>Active Sites</h2>
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
              <tr key={site.siteId}>
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
                <td><span className="badge success">Active</span></td>
                <td>
                  <button className="button danger" disabled={Boolean(busyAction)} onClick={() => void mutate(`/api/v1/admin/sites/${site.siteId}/deactivate`, "POST", `site:${site.siteId}`, "Site updated.", `Mark ${site.siteName} inactive? It will no longer be available for new claims.`)} type="button">
                    {busyAction === `site:${site.siteId}` ? <Loader2 size={18} /> : <PowerOff size={18} />}
                    Mark inactive
                  </button>
                </td>
              </tr>
            ))}
            {sites.length === 0 ? (
              <tr>
                <td colSpan={6}>No active sites found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function maskAccount(value: string) {
  if (value.length <= 4) return value;
  return `****${value.slice(-4)}`;
}
