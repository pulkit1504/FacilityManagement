alter table notification_outbox
  add column if not exists delivery_attempts integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_error text,
  add column if not exists provider_message_id text;

create index if not exists ix_notification_outbox_retry
  on notification_outbox(status, delivery_attempts, created_at)
  where status in ('Queued', 'Failed');
