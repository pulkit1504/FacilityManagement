create unique index if not exists ux_claims_one_active_settlement_per_advance
  on expense_claims(advance_claim_id)
  where claim_kind = 'Settlement'
    and status in ('Submitted', 'HodApproved', 'MdApproved', 'FinanceConfirmed')
    and is_deleted = false;
