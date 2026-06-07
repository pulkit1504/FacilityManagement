create or replace function release_payment_atomically(
  claim_id_input uuid,
  actor_user_id_input text,
  correlation_id_input text
)
returns expense_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  claim_record expense_claims%rowtype;
  advance_record expense_claims%rowtype;
  alert_line record;
  pre_release_status text;
begin
  select *
  into claim_record
  from expense_claims
  where claim_id = claim_id_input
    and is_deleted = false
  for update;

  if not found then
    raise exception 'Claim was not found.';
  end if;

  if claim_record.status = 'PaymentReleased' then
    raise exception 'Payment has already been released for this claim.';
  end if;
  pre_release_status := claim_record.status;

  if claim_record.claim_kind = 'Advance' then
    if claim_record.status not in ('HodApproved', 'MdApproved') then
      raise exception 'Only approved advances can be released for payment.';
    end if;
  elsif claim_record.status <> 'FinanceConfirmed' then
    raise exception 'Only Finance-confirmed claims can be released for payment.';
  end if;

  if claim_record.claim_kind <> 'Advance' and claim_record.physical_receipt_confirmed_at is null then
    raise exception 'Physical receipt confirmation is required before payment can be released.';
  end if;

  if claim_record.claim_kind <> 'Advance' and exists (
    select 1
    from expense_line_items
    where claim_id = claim_id_input
      and is_deleted = false
      and finance_review_status <> 'Accepted'
  ) then
    raise exception 'All line items must be accepted by Finance before payment release.';
  end if;

  if claim_record.final_payable_amount > 0 and exists (
    select 1
    from employees
    where employee_id = claim_record.submitter_employee_id
      and (
        bank_account_holder_name is null
        or bank_account_number is null
        or bank_ifsc is null
        or bank_name is null
      )
  ) then
    raise exception 'Beneficiary bank details are required before payment release.';
  end if;

  if claim_record.advance_claim_id is not null then
    select *
    into advance_record
    from expense_claims
    where claim_id = claim_record.advance_claim_id
      and claim_kind = 'Advance'
      and status = 'PaymentReleased'
      and is_deleted = false
    for update;

    if not found then
      raise exception 'Advance adjustments must be linked to a paid advance.';
    end if;

    if claim_record.advance_adjustment_amount > advance_record.advance_balance then
      raise exception 'Advance adjustment exceeds the available advance balance.';
    end if;

    update expense_claims
    set settled_amount = least(advance_amount, settled_amount + claim_record.advance_adjustment_amount),
        advance_balance = greatest(0, advance_amount - (settled_amount + claim_record.advance_adjustment_amount)),
        updated_at = now()
    where claim_id = advance_record.claim_id;
  end if;

  update approval_steps
  set decision = 'Approved',
      decision_at = now(),
      remarks = coalesce(remarks, 'Payment released by Finance.')
  where claim_id = claim_id_input
    and required_approver_role = 'Finance'
    and decision = 'Pending';

  for alert_line in
    insert into billing_alerts (
      alert_id,
      line_item_id,
      claim_id,
      next_send_at,
      escalation_level,
      alerts_sent_count,
      is_resolved
    )
    select
      gen_random_uuid(),
      line.line_item_id,
      claim_id_input,
      now() + interval '48 hours',
      0,
      0,
      false
    from expense_line_items line
    where line.claim_id = claim_id_input
      and line.expense_tag = 'PendingBilling'
      and line.is_deleted = false
      and not exists (
        select 1
        from billing_alerts alert
        where alert.line_item_id = line.line_item_id
          and alert.is_resolved = false
      )
    returning line_item_id
  loop
    update expense_line_items
    set billing_alert_created = true
    where line_item_id = alert_line.line_item_id;

    insert into audit_log (
      claim_id,
      actor_user_id,
      action_type,
      pre_action_status,
      post_action_status,
      audit_remarks,
      correlation_id
    )
    values (
      claim_id_input::text,
      actor_user_id_input,
      'BILLING_ALERT_CREATED',
      'PendingBilling',
      'PendingBilling',
      'Billing alert created for line item ' || alert_line.line_item_id::text,
      correlation_id_input
    );
  end loop;

  update expense_claims
  set status = 'PaymentReleased',
      updated_at = now()
  where claim_id = claim_id_input
  returning * into claim_record;

  insert into audit_log (
    claim_id,
    actor_user_id,
    action_type,
    pre_action_status,
    post_action_status,
    correlation_id
  )
  values (
    claim_id_input::text,
    actor_user_id_input,
    'PAYMENT_RELEASE',
    pre_release_status,
    'PaymentReleased',
    correlation_id_input
  );

  return claim_record;
end;
$$;

revoke all on function release_payment_atomically(uuid, text, text) from public;
grant execute on function release_payment_atomically(uuid, text, text) to service_role;
