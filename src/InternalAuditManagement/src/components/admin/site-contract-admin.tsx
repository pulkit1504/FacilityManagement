"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, CalendarPlus, Loader2, Plus, PowerOff, UserPlus, X } from "lucide-react";

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
};

type Employee = {
  employeeId: string;
  fullName: string;
  email: string;
  role: "Claimant" | "HOD" | "MD" | "Finance" | "BillingTeam" | "FinanceHOD" | "Admin";
  directManagerId: string | null;
  isHod: boolean;
  approvalThresholdAmount: number;
  isActive: boolean;
};

type Holiday = {
  holidayDate: string;
  holidayName: string;
  isNational: boolean;
};

const today = new Date().toISOString().slice(0, 10);
const roles: Employee["role"][] = ["Claimant", "HOD", "MD", "Finance", "BillingTeam", "FinanceHOD", "Admin"];

export function SiteContractAdmin() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
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
    contractId: ""
  });
  const [employeeDraft, setEmployeeDraft] = useState({
    employeeId: "",
    fullName: "",
    email: "",
    role: "Claimant" as Employee["role"],
    directManagerId: "",
    isHod: false,
    approvalThresholdAmount: 0,
    temporaryPassword: ""
  });
  const [holidayDraft, setHolidayDraft] = useState({
    holidayDate: today,
    holidayName: "",
    isNational: true
  });

  const managerOptions = useMemo(
    () => employees.filter((employee) => ["HOD", "MD", "FinanceHOD", "Finance"].includes(employee.role)),
    [employees]
  );
  const employeeNames = useMemo(
    () => new Map(employees.map((employee) => [employee.employeeId, employee.fullName])),
    [employees]
  );

  async function load() {
    try {
      const response = await fetch("/api/v1/admin/master-data", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.detail ?? "Could not load master data.");
        return;
      }
      setContracts(data.contracts ?? []);
      setSites(data.sites ?? []);
      setEmployees(data.employees ?? []);
      setHolidays(data.holidays ?? []);
      setSiteDraft((current) => ({ ...current, contractId: current.contractId || data.contracts?.[0]?.contractId || "" }));
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
      setMessage(data.message ?? data.detail ?? fallback);
      if (response.ok) {
        await load();
      }
      return response.ok;
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
    const saved = await postJson("/api/v1/admin/sites", siteDraft, "site:create", "Site saved.");
    if (saved) {
      setSiteDraft((current) => ({ siteName: "", siteAddress: "", serviceType: "Both", contractId: current.contractId }));
    }
  }

  async function createEmployee() {
    const saved = await postJson(
      "/api/v1/admin/employees",
      {
        ...employeeDraft,
        directManagerId: employeeDraft.directManagerId || null,
        isHod: employeeDraft.role === "HOD" || employeeDraft.isHod,
        temporaryPassword: employeeDraft.temporaryPassword || null
      },
      "employee:create",
      "Employee saved."
    );
    if (saved) {
      setEmployeeDraft({
        employeeId: "",
        fullName: "",
        email: "",
        role: "Claimant",
        directManagerId: "",
        isHod: false,
        approvalThresholdAmount: 0,
        temporaryPassword: ""
      });
    }
  }

  async function createHoliday() {
    const saved = await postJson("/api/v1/admin/holidays", holidayDraft, "holiday:create", "Holiday saved.");
    if (saved) {
      setHolidayDraft({ holidayDate: today, holidayName: "", isNational: true });
    }
  }

  async function mutate(path: string, method: "POST" | "DELETE", action: string, fallback: string) {
    setBusyAction(action);
    setMessage("");
    try {
      const response = await fetch(path, { method });
      const data = await response.json();
      setMessage(data.message ?? data.detail ?? fallback);
      if (response.ok) {
        await load();
      }
    } finally {
      setBusyAction(null);
    }
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
      {message ? <p className="muted">{message}</p> : null}

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
            </div>
            <button className="button" disabled={busyAction !== null || !siteDraft.siteName || !siteDraft.contractId} onClick={() => void createSite()} type="button">
              {busyAction === "site:create" ? <Loader2 size={18} /> : <Building2 size={18} />}
              Add site
            </button>
          </div>
        </section>
      </div>

      <div className="grid cols-2">
        <section className="panel">
          <h2>Add Employee</h2>
          <div className="grid">
            <div className="grid cols-2">
              <label>
                <span className="muted">Employee ID</span>
                <input value={employeeDraft.employeeId} onChange={(event) => setEmployeeDraft({ ...employeeDraft, employeeId: event.target.value })} />
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
            <label className="checkbox-row">
              <input type="checkbox" checked={employeeDraft.isHod || employeeDraft.role === "HOD"} onChange={(event) => setEmployeeDraft({ ...employeeDraft, isHod: event.target.checked })} />
              HOD approver
            </label>
            <button className="button" disabled={busyAction !== null || !employeeDraft.employeeId || !employeeDraft.fullName || !employeeDraft.email} onClick={() => void createEmployee()} type="button">
              {busyAction === "employee:create" ? <Loader2 size={18} /> : <UserPlus size={18} />}
              Save employee
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
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.employeeId}>
                <td>
                  <strong>{employee.fullName}</strong>
                  <br />
                  <span className="muted">{employee.employeeId} - {employee.email}</span>
                </td>
                <td>{employee.role}{employee.isHod ? " / HOD" : ""}</td>
                <td>{employee.directManagerId ? employeeNames.get(employee.directManagerId) ?? employee.directManagerId : "No manager"}</td>
                <td>{employee.approvalThresholdAmount.toLocaleString()}</td>
                <td>
                  <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void mutate(`/api/v1/admin/employees/${employee.employeeId}/deactivate`, "POST", `employee:${employee.employeeId}`, "Employee updated.")} type="button">
                    {busyAction === `employee:${employee.employeeId}` ? <Loader2 size={18} /> : <PowerOff size={18} />}
                    Mark inactive
                  </button>
                </td>
              </tr>
            ))}
            {employees.length === 0 ? (
              <tr>
                <td colSpan={5}>No active employees found.</td>
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
                  <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void mutate(`/api/v1/admin/holidays/${holiday.holidayDate}`, "DELETE", `holiday:${holiday.holidayDate}`, "Holiday removed.")} type="button">
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
        <h2>Active Sites</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Site</th>
              <th>Client / Contract</th>
              <th>Service</th>
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
                <td><span className="badge success">Active</span></td>
                <td>
                  <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void mutate(`/api/v1/admin/sites/${site.siteId}/deactivate`, "POST", `site:${site.siteId}`, "Site updated.")} type="button">
                    {busyAction === `site:${site.siteId}` ? <Loader2 size={18} /> : <PowerOff size={18} />}
                    Mark inactive
                  </button>
                </td>
              </tr>
            ))}
            {sites.length === 0 ? (
              <tr>
                <td colSpan={5}>No active sites found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
