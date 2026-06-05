alter table expense_claims
  add column if not exists advance_adjustment_amount numeric(18,2) not null default 0 check (advance_adjustment_amount >= 0),
  add column if not exists final_payable_amount numeric(18,2) not null default 0 check (final_payable_amount >= 0),
  add column if not exists net_advance_left_amount numeric(18,2) not null default 0 check (net_advance_left_amount >= 0);

update expense_claims
set
  advance_adjustment_amount = 0,
  final_payable_amount = total_amount,
  net_advance_left_amount = 0
where is_deleted = false;

update expense_claims settlement
set
  advance_adjustment_amount = least(settlement.total_amount, advance.advance_balance),
  final_payable_amount = greatest(settlement.total_amount - advance.advance_balance, 0),
  net_advance_left_amount = greatest(advance.advance_balance - settlement.total_amount, 0)
from expense_claims advance
where settlement.claim_kind = 'Settlement'
  and settlement.advance_claim_id = advance.claim_id
  and settlement.is_deleted = false
  and advance.is_deleted = false;
