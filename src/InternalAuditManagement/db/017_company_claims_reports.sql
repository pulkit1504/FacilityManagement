alter table expense_claims
  add column if not exists company text not null default 'Nimbus';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_expense_claims_company'
  ) then
    alter table expense_claims
      add constraint chk_expense_claims_company
      check (company in ('Nimbus', 'Striker'));
  end if;
end $$;

create index if not exists ix_claims_company_status
  on expense_claims(company, status, updated_at desc)
  where is_deleted = false;
