create table if not exists expense_heads (
  expense_head_id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_expense_heads_name_active
  on expense_heads(lower(name))
  where is_active = true;

insert into expense_heads (name)
values
  ('Housekeeping Consumables'),
  ('Cleaning Chemicals'),
  ('Pantry and Refreshments'),
  ('Repairs and Maintenance'),
  ('Electrical and Plumbing'),
  ('Security Operations'),
  ('Printing and Stationery'),
  ('Courier and Postage'),
  ('Travel and Conveyance'),
  ('Fuel and Parking'),
  ('Staff Welfare'),
  ('Uniform and PPE'),
  ('Waste Management'),
  ('Pest Control'),
  ('Client Rechargeable'),
  ('Other')
on conflict do nothing;

alter table employees
  add column if not exists password_reset_required boolean not null default false,
  add column if not exists password_updated_at timestamptz;
