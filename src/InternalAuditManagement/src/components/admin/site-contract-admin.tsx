"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2, Plus, PowerOff } from "lucide-react";

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

const today = new Date().toISOString().slice(0, 10);

export function SiteContractAdmin() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
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
      setSiteDraft((current) => ({ ...current, contractId: current.contractId || data.contracts?.[0]?.contractId || "" }));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createContract() {
    setBusyAction("contract:create");
    setMessage("");
    try {
      const response = await fetch("/api/v1/admin/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: contractDraft.clientName,
          description: contractDraft.description || null,
          startDate: contractDraft.startDate,
          endDate: contractDraft.endDate || null
        })
      });
      const data = await response.json();
      setMessage(data.message ?? data.detail ?? "Contract saved.");
      if (response.ok) {
        setContractDraft({ clientName: "", description: "", startDate: today, endDate: "" });
        await load();
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function createSite() {
    setBusyAction("site:create");
    setMessage("");
    try {
      const response = await fetch("/api/v1/admin/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(siteDraft)
      });
      const data = await response.json();
      setMessage(data.message ?? data.detail ?? "Site saved.");
      if (response.ok) {
        setSiteDraft((current) => ({ siteName: "", siteAddress: "", serviceType: "Both", contractId: current.contractId }));
        await load();
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function deactivateSite(siteId: string) {
    setBusyAction(`site:${siteId}`);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/admin/sites/${siteId}/deactivate`, { method: "POST" });
      const data = await response.json();
      setMessage(data.message ?? data.detail ?? "Site updated.");
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
                  <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void deactivateSite(site.siteId)} type="button">
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
