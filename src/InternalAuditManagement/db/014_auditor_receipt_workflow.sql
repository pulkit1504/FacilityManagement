alter table employees drop constraint if exists employees_role_check;
alter table employees
  add constraint employees_role_check
  check (role in ('Claimant', 'ClusterHead', 'HOD', 'MD', 'Finance', 'BillingTeam', 'FinanceHOD', 'Auditor', 'Admin'));

alter table approval_steps drop constraint if exists approval_steps_required_approver_role_check;
alter table approval_steps
  add constraint approval_steps_required_approver_role_check
  check (required_approver_role in ('ClusterHead', 'HOD', 'MD', 'Finance', 'Auditor'));

alter table expense_claims drop constraint if exists expense_claims_status_check;
alter table expense_claims drop constraint if exists chk_expense_claims_status;
alter table expense_claims
  add constraint chk_expense_claims_status
  check (status in ('Draft', 'Submitted', 'HodApproved', 'MdApproved', 'AuditPending', 'FinanceConfirmed', 'PaymentReleased', 'Rejected'));

drop index if exists ux_claims_one_active_adjustment_per_advance;
create unique index if not exists ux_claims_one_active_adjustment_per_advance
  on expense_claims(advance_claim_id)
  where advance_claim_id is not null
    and status in ('Draft', 'Submitted', 'HodApproved', 'MdApproved', 'AuditPending', 'FinanceConfirmed')
    and is_deleted = false;

insert into employees (
  employee_id,
  full_name,
  email,
  role,
  direct_manager_id,
  is_hod,
  approval_threshold_amount,
  imprest_advance_limit
)
values (
  'emp-auditor-001',
  'Internal Auditor',
  'auditor@example.com',
  'Auditor',
  'emp-md-001',
  false,
  0,
  0
)
on conflict (employee_id) do update
set
  full_name = excluded.full_name,
  email = excluded.email,
  role = excluded.role,
  direct_manager_id = excluded.direct_manager_id,
  is_active = true;
