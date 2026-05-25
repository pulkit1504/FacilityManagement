insert into employees (
  employee_id,
  full_name,
  email,
  role,
  direct_manager_id,
  is_hod,
  approval_threshold_amount
) values
  ('emp-md-001', 'Managing Director', 'md@example.com', 'MD', null, false, 0),
  ('emp-hod-001', 'Operations HOD', 'hod@example.com', 'HOD', 'emp-md-001', true, 5000),
  ('emp-claimant-001', 'Site Supervisor', 'claimant@example.com', 'Claimant', 'emp-hod-001', false, 0),
  ('emp-finance-001', 'Finance User', 'finance@example.com', 'Finance', 'emp-md-001', false, 0),
  ('emp-billing-001', 'Billing User', 'billing@example.com', 'BillingTeam', 'emp-finance-001', false, 0)
on conflict (employee_id) do nothing;

insert into client_contracts (contract_id, client_name, description, start_date)
values ('ctr-ansal-001', 'Ansal Heights RWA', 'Residential society FM contract', '2026-01-01')
on conflict (contract_id) do nothing;

insert into sites (site_id, site_name, site_address, service_type, contract_id)
values ('site-ansal-a', 'Ansal Heights Block A', 'Sector 92, Gurugram', 'Both', 'ctr-ansal-001')
on conflict (site_id) do nothing;
