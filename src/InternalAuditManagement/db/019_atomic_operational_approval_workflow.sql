create or replace function submit_claim_with_approval_steps(
  claim_id_input uuid,
  next_status_input text,
  approval_steps_input jsonb default '[]'::jsonb
)
returns expense_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  claim_record expense_claims%rowtype;
  step_record jsonb;
begin
  if next_status_input not in ('Submitted', 'HodApproved') then
    raise exception 'Unsupported submission status.';
  end if;

  select * into claim_record
  from expense_claims
  where claim_id = claim_id_input and is_deleted = false
  for update;

  if not found then raise exception 'Claim was not found.'; end if;
  if claim_record.status <> 'Draft' then raise exception 'Only Draft claims can be submitted.'; end if;

  delete from approval_steps where claim_id = claim_id_input;

  for step_record in select value from jsonb_array_elements(coalesce(approval_steps_input, '[]'::jsonb))
  loop
    insert into approval_steps (
      step_id, claim_id, line_item_id, step_order, required_approver_role, assigned_approver_id, decision
    ) values (
      gen_random_uuid(), claim_id_input, nullif(step_record->>'line_item_id', '')::uuid,
      (step_record->>'step_order')::integer, step_record->>'required_approver_role',
      nullif(step_record->>'assigned_approver_id', ''), 'Pending'
    );
  end loop;

  if next_status_input = 'Submitted' and not exists (
    select 1 from approval_steps where claim_id = claim_id_input and decision = 'Pending'
  ) then
    raise exception 'A submitted claim must have an operational approval step.';
  end if;

  if next_status_input = 'HodApproved' then
    insert into approval_steps (step_id, claim_id, step_order, required_approver_role, assigned_approver_id, decision)
    values (gen_random_uuid(), claim_id_input, 1, 'Finance', null, 'Pending');
  end if;

  update expense_claims
  set status = next_status_input, updated_at = now()
  where claim_id = claim_id_input
  returning * into claim_record;

  return claim_record;
end;
$$;

create or replace function complete_operational_approval(
  claim_id_input uuid,
  step_id_input uuid,
  next_status_input text,
  remarks_input text default null
)
returns expense_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  claim_record expense_claims%rowtype;
  current_step_id uuid;
  next_order integer;
begin
  if next_status_input not in ('HodApproved', 'MdApproved') then
    raise exception 'Unsupported operational approval status.';
  end if;

  select * into claim_record
  from expense_claims
  where claim_id = claim_id_input and is_deleted = false
  for update;

  if not found then raise exception 'Claim was not found.'; end if;
  if claim_record.status <> 'Submitted' then raise exception 'Only Submitted claims can be operationally approved.'; end if;

  select step_id into current_step_id
  from approval_steps
  where claim_id = claim_id_input and decision = 'Pending'
  order by step_order, step_id
  limit 1
  for update;

  if current_step_id is distinct from step_id_input then
    raise exception 'The selected approval is not the current pending step.';
  end if;

  update approval_steps
  set decision = 'Approved', decision_at = now(), remarks = remarks_input
  where step_id = step_id_input and claim_id = claim_id_input and decision = 'Pending';

  if exists (
    select 1 from approval_steps
    where claim_id = claim_id_input and decision = 'Pending'
      and required_approver_role in ('ClusterHead', 'HOD', 'MD')
  ) then
    raise exception 'Operational approval steps are still pending.';
  end if;

  select coalesce(max(step_order), 0) + 1 into next_order
  from approval_steps where claim_id = claim_id_input;

  insert into approval_steps (step_id, claim_id, step_order, required_approver_role, assigned_approver_id, decision)
  select gen_random_uuid(), claim_id_input, next_order, 'Finance', null, 'Pending'
  where not exists (
    select 1 from approval_steps
    where claim_id = claim_id_input and required_approver_role = 'Finance' and decision = 'Pending'
  );

  update expense_claims
  set status = next_status_input, updated_at = now()
  where claim_id = claim_id_input
  returning * into claim_record;

  return claim_record;
end;
$$;

-- Repair claims already marked as Finance-bound while an obsolete operational
-- step still blocks the workflow. The top-level status is the committed record
-- of the completed HOD/MD action for these rows.
update approval_steps step
set decision = 'Approved',
    decision_at = coalesce(step.decision_at, now()),
    remarks = coalesce(step.remarks, 'Reconciled by atomic workflow migration.')
from expense_claims claim
where step.claim_id = claim.claim_id
  and claim.is_deleted = false
  and claim.status in ('HodApproved', 'MdApproved')
  and step.decision = 'Pending'
  and step.required_approver_role in ('ClusterHead', 'HOD', 'MD');

insert into approval_steps (step_id, claim_id, step_order, required_approver_role, assigned_approver_id, decision)
select gen_random_uuid(), claim.claim_id, coalesce(max(existing.step_order), 0) + 1, 'Finance', null, 'Pending'
from expense_claims claim
left join approval_steps existing on existing.claim_id = claim.claim_id
where claim.is_deleted = false
  and claim.status in ('HodApproved', 'MdApproved')
group by claim.claim_id
having count(*) filter (where existing.required_approver_role = 'Finance' and existing.decision = 'Pending') = 0;
