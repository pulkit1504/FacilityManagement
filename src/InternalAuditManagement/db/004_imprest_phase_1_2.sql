alter table expense_claims
  add column if not exists ticket_id text,
  add column if not exists claim_kind text not null default 'Reimbursement',
  add column if not exists claim_period_month date,
  add column if not exists advance_claim_id uuid references expense_claims(claim_id),
  add column if not exists advance_amount numeric(18,2) not null default 0,
  add column if not exists settled_amount numeric(18,2) not null default 0,
  add column if not exists advance_balance numeric(18,2) not null default 0;

update expense_claims
set ticket_id = coalesce(
  ticket_id,
  case claim_kind
    when 'Advance' then 'ADV'
    when 'Settlement' then 'SET'
    else 'EXP'
  end || '-' || to_char(created_at, 'YYMMDD') || '-' || upper(left(claim_id::text, 4))
)
where ticket_id is null;

alter table expense_claims
  alter column ticket_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_claim_kind'
  ) then
    alter table expense_claims
      add constraint chk_claim_kind check (claim_kind in ('Advance', 'Settlement', 'Reimbursement'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'uq_expense_claims_ticket_id'
  ) then
    alter table expense_claims
      add constraint uq_expense_claims_ticket_id unique (ticket_id);
  end if;
end $$;

alter table expense_line_items
  add column if not exists expense_head text,
  add column if not exists payment_mode text,
  add column if not exists vendor_name text,
  add column if not exists vendor_invoice_number text,
  add column if not exists billable_amount numeric(18,2),
  add column if not exists site_or_department text,
  add column if not exists line_ticket_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_line_payment_mode'
  ) then
    alter table expense_line_items
      add constraint chk_line_payment_mode check (payment_mode is null or payment_mode in ('Cash', 'UPI'));
  end if;
end $$;

alter table employees
  add column if not exists bank_account_holder_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_ifsc text,
  add column if not exists bank_name text;

create index if not exists ix_claims_kind_status on expense_claims(claim_kind, status) where is_deleted = false;
create index if not exists ix_claims_advance_claim_id on expense_claims(advance_claim_id) where is_deleted = false;
