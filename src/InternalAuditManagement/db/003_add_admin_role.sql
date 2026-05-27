alter table employees drop constraint if exists employees_role_check;

alter table employees
  add constraint employees_role_check
  check (role in ('Claimant', 'HOD', 'MD', 'Finance', 'BillingTeam', 'FinanceHOD', 'Admin'));

insert into employees (
  employee_id,
  full_name,
  email,
  role,
  direct_manager_id,
  is_hod,
  approval_threshold_amount
) values
  ('emp-admin-001', 'System Admin', 'admin@example.com', 'Admin', 'emp-md-001', false, 0)
on conflict (employee_id) do update set
  full_name = excluded.full_name,
  email = excluded.email,
  role = excluded.role,
  direct_manager_id = excluded.direct_manager_id,
  is_hod = excluded.is_hod,
  approval_threshold_amount = excluded.approval_threshold_amount,
  is_active = true;
