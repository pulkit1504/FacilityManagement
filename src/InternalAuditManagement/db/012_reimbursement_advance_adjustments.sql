-- Expense claims remain Reimbursement claims even when an advance is applied.
-- Payment release keys advance settlement behavior off advance_claim_id.

update expense_claims
set claim_kind = 'Reimbursement'
where claim_kind = 'Settlement';

alter table expense_claims drop constraint if exists expense_claims_claim_kind_check;
alter table expense_claims drop constraint if exists chk_claim_kind;
alter table expense_claims
  add constraint chk_claim_kind
  check (claim_kind in ('Advance', 'Reimbursement'));

create unique index if not exists ux_expense_claims_ticket_id on expense_claims(ticket_id);

-- Legacy data can contain multiple active claims linked to the same advance
-- because the previous unique index did not cover drafts or Reimbursement
-- claims. Keep the most advanced/recent adjustment and soft-delete the rest so
-- dependent audit records remain intact.
with ranked_adjustments as (
  select
    claim_id,
    status,
    row_number() over (
      partition by advance_claim_id
      order by
        case status
          when 'FinanceConfirmed' then 1
          when 'MdApproved' then 2
          when 'HodApproved' then 3
          when 'Submitted' then 4
          else 5
        end,
        updated_at desc,
        created_at desc,
        claim_id
    ) as adjustment_rank
  from expense_claims
  where advance_claim_id is not null
    and status in ('Draft', 'Submitted', 'HodApproved', 'MdApproved', 'FinanceConfirmed')
    and is_deleted = false
)
update expense_claims claim
set
  is_deleted = true,
  updated_at = now()
from ranked_adjustments ranked
where claim.claim_id = ranked.claim_id
  and ranked.adjustment_rank > 1;

create unique index if not exists ux_claims_one_active_adjustment_per_advance
  on expense_claims(advance_claim_id)
  where advance_claim_id is not null
    and status in ('Draft', 'Submitted', 'HodApproved', 'MdApproved', 'FinanceConfirmed')
    and is_deleted = false;

drop index if exists ux_claims_one_active_settlement_per_advance;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('release_payment_atomically(uuid,text,text)'::regprocedure)
  into function_definition;

  function_definition := replace(
    replace(
      function_definition,
      'if claim_record.claim_kind = ''Settlement'' then',
      'if claim_record.advance_claim_id is not null then'
    ),
    'Settlement claims must be linked to a paid advance.',
    'Advance adjustments must be linked to a paid advance.'
  );

  if position('claim_record.advance_claim_id is not null' in function_definition) = 0 then
    raise exception 'Could not update release_payment_atomically for advance adjustments.';
  end if;

  execute function_definition;
end;
$$;
