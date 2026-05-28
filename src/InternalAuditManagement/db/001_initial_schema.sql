create extension if not exists "pgcrypto";

create table if not exists employees (
  employee_id text primary key,
  full_name text not null,
  email text not null unique,
  role text not null check (role in ('Claimant', 'HOD', 'MD', 'Finance', 'BillingTeam', 'FinanceHOD', 'Admin')),
  password_hash text,
  direct_manager_id text references employees(employee_id),
  is_hod boolean not null default false,
  approval_threshold_amount numeric(18,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists client_contracts (
  contract_id text primary key,
  client_name text not null,
  description text,
  start_date date not null,
  end_date date,
  is_active boolean not null default true
);

create table if not exists sites (
  site_id text primary key,
  site_name text not null,
  site_address text,
  service_type text not null check (service_type in ('Housekeeping', 'Security', 'Both')),
  contract_id text references client_contracts(contract_id),
  is_active boolean not null default true
);

create table if not exists expense_claims (
  claim_id uuid primary key default gen_random_uuid(),
  submitter_employee_id text not null references employees(employee_id),
  submission_mode text not null check (submission_mode in ('SingleVoucher', 'Proforma')),
  proforma_period_start date,
  proforma_period_end date,
  status text not null default 'Draft' check (
    status in ('Draft', 'Submitted', 'HodApproved', 'MdApproved', 'FinanceConfirmed', 'PaymentReleased', 'Rejected')
  ),
  total_amount numeric(18,2) not null default 0,
  site_id text references sites(site_id),
  rejection_reason text,
  physical_receipt_confirmed_at timestamptz,
  physical_receipt_confirmed_by text references employees(employee_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  constraint chk_proforma_period check (
    submission_mode = 'SingleVoucher'
    or (proforma_period_start is not null and proforma_period_end is not null and proforma_period_end > proforma_period_start)
  )
);

create table if not exists expense_line_items (
  line_item_id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references expense_claims(claim_id),
  description text not null check (length(description) between 3 and 500),
  amount numeric(18,2) not null check (amount > 0),
  transaction_date date not null,
  expense_tag text not null check (expense_tag in ('AlreadyBilled', 'PendingBilling', 'ContractPartCost', 'BackendCTC')),
  client_invoice_number text,
  invoice_validation_status text not null default 'NotApplicable' check (
    invoice_validation_status in ('Valid', 'Invalid', 'NotApplicable', 'PendingErpValidation')
  ),
  billing_alert_created boolean not null default false,
  site_id text references sites(site_id),
  missing_receipt_flag boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  constraint chk_already_billed_invoice check (expense_tag <> 'AlreadyBilled' or client_invoice_number is not null),
  constraint chk_contract_part_site check (expense_tag <> 'ContractPartCost' or site_id is not null)
);

create table if not exists expense_attachments (
  attachment_id uuid primary key default gen_random_uuid(),
  line_item_id uuid not null references expense_line_items(line_item_id),
  storage_path text not null,
  content_hash char(64) not null,
  original_file_name text not null,
  file_size_bytes integer not null check (file_size_bytes > 0),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/heic', 'application/pdf')),
  uploaded_at timestamptz not null default now(),
  uploaded_by_user_id text not null references employees(employee_id)
);

create table if not exists approval_steps (
  step_id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references expense_claims(claim_id),
  step_order integer not null,
  required_approver_role text not null check (required_approver_role in ('HOD', 'MD', 'Finance')),
  assigned_approver_id text references employees(employee_id),
  decision text not null default 'Pending' check (decision in ('Pending', 'Approved', 'Rejected')),
  decision_at timestamptz,
  remarks text
);

create table if not exists billing_alerts (
  alert_id uuid primary key default gen_random_uuid(),
  line_item_id uuid not null references expense_line_items(line_item_id),
  claim_id uuid not null references expense_claims(claim_id),
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  next_send_at timestamptz not null,
  escalation_level smallint not null default 0,
  alerts_sent_count integer not null default 0,
  is_resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by_user_id text references employees(employee_id)
);

create table if not exists fraud_flags (
  flag_id uuid primary key default gen_random_uuid(),
  primary_claim_id uuid not null references expense_claims(claim_id),
  related_claim_ids jsonb,
  rule_name text not null check (rule_name in ('DuplicateVoucher', 'ThresholdSplit', 'WeekendOutlier')),
  flagged_at timestamptz not null default now(),
  sweep_date date not null,
  status text not null default 'Open' check (status in ('Open', 'Cleared', 'Escalated')),
  reviewed_by_user_id text references employees(employee_id),
  review_remarks text,
  reviewed_at timestamptz
);

create table if not exists holidays (
  holiday_date date primary key,
  holiday_name text not null,
  is_national boolean not null default true
);

create table if not exists audit_log (
  log_id bigint generated always as identity primary key,
  claim_id text not null,
  action_timestamp timestamptz not null default now(),
  actor_user_id text not null,
  action_type text not null,
  pre_action_status text,
  post_action_status text not null,
  audit_remarks text,
  ip_address text,
  correlation_id text,
  constraint chk_audit_remarks_required check (
    action_type not in ('REJECT', 'BILLABLE_TAG_CHANGE')
    or audit_remarks is not null
  )
);

create index if not exists ix_claims_submitter on expense_claims(submitter_employee_id) where is_deleted = false;
create index if not exists ix_claims_status on expense_claims(status) where is_deleted = false;
create index if not exists ix_audit_log_claim_id on audit_log(claim_id);
create index if not exists ix_audit_log_timestamp on audit_log(action_timestamp desc);
create index if not exists ix_billing_alerts_next_send on billing_alerts(next_send_at) where is_resolved = false;
create index if not exists ix_line_items_date_amount on expense_line_items(transaction_date, amount) where is_deleted = false;
create index if not exists ix_employees_manager on employees(direct_manager_id) where is_active = true;

create or replace function prevent_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

drop trigger if exists trg_prevent_audit_log_update on audit_log;
create trigger trg_prevent_audit_log_update
before update or delete on audit_log
for each row execute function prevent_audit_log_mutation();

create or replace view vw_billing_recovery_ratio as
select
  cc.contract_id,
  cc.client_name,
  coalesce(sum(case when li.expense_tag in ('AlreadyBilled', 'PendingBilling') then li.amount else 0 end), 0) as total_billable_approved,
  coalesce(sum(case when li.expense_tag = 'AlreadyBilled' and li.invoice_validation_status = 'Valid' then li.amount else 0 end), 0) as total_billed,
  case
    when sum(case when li.expense_tag in ('AlreadyBilled', 'PendingBilling') then li.amount else 0 end) = 0 then null
    else round(
      sum(case when li.expense_tag = 'AlreadyBilled' and li.invoice_validation_status = 'Valid' then li.amount else 0 end) * 100.0
      / sum(case when li.expense_tag in ('AlreadyBilled', 'PendingBilling') then li.amount else 0 end),
      2
    )
  end as billing_recovery_ratio_pct
from expense_claims ec
join expense_line_items li on li.claim_id = ec.claim_id and li.is_deleted = false
join sites s on s.site_id = ec.site_id
join client_contracts cc on cc.contract_id = s.contract_id
where ec.status in ('FinanceConfirmed', 'PaymentReleased')
  and ec.is_deleted = false
group by cc.contract_id, cc.client_name;
