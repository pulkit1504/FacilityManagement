alter table employees
  drop constraint if exists employees_role_check;

alter table employees
  add constraint employees_role_check
  check (role in ('Claimant', 'ClusterHead', 'HOD', 'MD', 'Finance', 'BillingTeam', 'FinanceHOD', 'Admin'));

alter table approval_steps
  drop constraint if exists approval_steps_required_approver_role_check;

alter table approval_steps
  add constraint approval_steps_required_approver_role_check
  check (required_approver_role in ('ClusterHead', 'HOD', 'MD', 'Finance'));

alter table sites
  add column if not exists cluster_head_employee_id text references employees(employee_id);

create table if not exists notification_outbox (
  notification_id uuid primary key default gen_random_uuid(),
  recipient_employee_id text not null references employees(employee_id),
  recipient_email text not null,
  subject text not null,
  body text not null,
  related_claim_id uuid references expense_claims(claim_id),
  status text not null default 'Queued' check (status in ('Queued', 'Sent', 'Failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists ix_sites_cluster_head
  on sites(cluster_head_employee_id)
  where is_active = true;

create index if not exists ix_notification_outbox_status
  on notification_outbox(status, created_at);
