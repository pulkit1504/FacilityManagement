update employees
set role = 'Finance'
where role = 'FinanceHOD';

alter table employees drop constraint if exists employees_role_check;
alter table employees
  add constraint employees_role_check
  check (role in ('Claimant', 'ClusterHead', 'HOD', 'MD', 'Finance', 'BillingTeam', 'Auditor', 'Admin'));

alter table approval_steps
  add column if not exists line_item_id uuid references expense_line_items(line_item_id);

create index if not exists ix_approval_steps_line_item
  on approval_steps(line_item_id)
  where line_item_id is not null;
