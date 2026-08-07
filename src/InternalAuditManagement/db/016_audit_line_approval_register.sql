alter table expense_line_items
  add column if not exists audit_review_status text not null default 'Pending',
  add column if not exists audit_approved_amount numeric(12,2),
  add column if not exists audit_review_remarks text,
  add column if not exists audit_reviewed_by text references employees(employee_id),
  add column if not exists audit_reviewed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_line_audit_review_status'
  ) then
    alter table expense_line_items
      add constraint chk_line_audit_review_status
      check (audit_review_status in ('Pending', 'Approved', 'Rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'chk_line_audit_approved_amount'
  ) then
    alter table expense_line_items
      add constraint chk_line_audit_approved_amount
      check (audit_approved_amount is null or audit_approved_amount >= 0);
  end if;
end $$;

create index if not exists ix_line_items_audit_review
  on expense_line_items(audit_review_status)
  where is_deleted = false;
