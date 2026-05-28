alter table employees
  add column if not exists imprest_advance_limit numeric(18,2) not null default 0;

create index if not exists ix_employees_imprest_limit
  on employees(imprest_advance_limit)
  where is_active = true and imprest_advance_limit > 0;
