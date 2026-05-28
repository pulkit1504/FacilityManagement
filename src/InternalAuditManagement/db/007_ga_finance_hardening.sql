create table if not exists ticket_counters (
  ticket_prefix text primary key,
  last_number integer not null default 0
);

insert into ticket_counters (ticket_prefix, last_number)
values ('ADV', 0), ('SET', 0), ('EXP', 0)
on conflict (ticket_prefix) do nothing;

create or replace function next_claim_ticket_id(claim_kind_input text)
returns text
language plpgsql
as $$
declare
  prefix text;
  next_number integer;
begin
  prefix := case claim_kind_input
    when 'Advance' then 'ADV'
    when 'Settlement' then 'SET'
    else 'EXP'
  end;

  insert into ticket_counters(ticket_prefix, last_number)
  values (prefix, 0)
  on conflict (ticket_prefix) do nothing;

  update ticket_counters
  set last_number = last_number + 1
  where ticket_prefix = prefix
  returning last_number into next_number;

  return prefix || '-' || lpad(next_number::text, 6, '0');
end;
$$;

alter table expense_line_items
  add column if not exists finance_review_status text not null default 'Pending',
  add column if not exists finance_review_remarks text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_line_finance_review_status'
  ) then
    alter table expense_line_items
      add constraint chk_line_finance_review_status
      check (finance_review_status in ('Pending', 'Accepted', 'Rejected'));
  end if;
end $$;

create index if not exists ix_line_items_finance_review
  on expense_line_items(finance_review_status)
  where is_deleted = false;

create unique index if not exists ux_line_items_client_invoice_number
  on expense_line_items(lower(client_invoice_number))
  where client_invoice_number is not null and is_deleted = false;
