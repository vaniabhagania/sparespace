/**
 * Database migrations. Applied automatically (once, under an advisory lock) the first
 * time the app touches the database, so connecting a Postgres is the only setup step.
 *
 * Rules for adding to this file: append a new entry, never edit one that has shipped.
 */
export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "001_init",
    sql: `
create table users (
  id uuid primary key default gen_random_uuid(),
  -- We never store phone numbers. This is HMAC-SHA256(phone, PHONE_PEPPER).
  phone_hash text not null unique,
  nickname text check (nickname is null or char_length(nickname) between 2 and 30),
  upi_id text check (upi_id is null or upi_id ~ '^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9]{2,32}$'),
  session_version integer not null default 0,
  banned_at timestamptz,
  deleted_at timestamptz,
  no_show_count integer not null default 0,
  late_cancel_count integer not null default 0,
  host_cancel_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  kind text not null check (kind in ('bike','hatchback','sedan','suv','van','truck')),
  length_cm integer not null check (length_cm between 100 and 1500),
  width_cm integer not null check (width_cm between 40 and 300),
  height_cm integer not null check (height_cm between 50 and 450),
  plate text check (plate is null or char_length(plate) between 4 and 14),
  created_at timestamptz not null default now()
);
create index vehicles_user_idx on vehicles(user_id);

create table spaces (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references users(id) on delete cascade,
  title text not null check (char_length(title) between 4 and 80),
  description text not null default '' check (char_length(description) <= 800),
  kind text not null check (kind in ('apartment','mall','office','driveway','open_lot','covered')),
  area_label text not null check (char_length(area_label) between 2 and 80),
  -- Exact address is only shown to a driver whose booking is confirmed.
  address_line text not null check (char_length(address_line) between 5 and 200),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  max_length_cm integer not null check (max_length_cm between 100 and 1500),
  max_width_cm integer not null check (max_width_cm between 40 and 300),
  max_height_cm integer not null check (max_height_cm between 50 and 450),
  capacity integer not null default 1 check (capacity between 1 and 20),
  price_hour_paise integer not null check (price_hour_paise between 1000 and 200000),
  price_day_paise integer check (price_day_paise is null or price_day_paise between 1000 and 2000000),
  instant_book boolean not null default false,
  -- bit0 = Monday ... bit6 = Sunday. Times are minutes from midnight, India time.
  days_mask integer not null default 127 check (days_mask between 1 and 127),
  open_minute integer not null default 0 check (open_minute between 0 and 1425 and open_minute % 15 = 0),
  close_minute integer not null default 1440 check (close_minute between 15 and 1440 and close_minute % 15 = 0),
  access_notes text not null default '' check (char_length(access_notes) <= 400),
  amenities text[] not null default '{}',
  rights_confirmed boolean not null check (rights_confirmed),
  status text not null default 'active' check (status in ('active','paused','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index spaces_geo_idx on spaces(lat, lng) where status = 'active';
create index spaces_host_idx on spaces(host_id);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  driver_id uuid not null references users(id) on delete cascade,
  vehicle_id uuid references vehicles(id) on delete set null,
  -- Snapshot, so later edits to a vehicle or listing never rewrite history.
  vehicle_label text not null,
  vehicle_kind text not null,
  v_length_cm integer not null,
  v_width_cm integer not null,
  v_height_cm integer not null,
  vehicle_plate text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'pending' check (status in
    ('pending','confirmed','declined','expired','cancelled_by_driver','cancelled_by_host','checked_in','completed','no_show')),
  price_paise integer not null check (price_paise >= 0),
  price_hour_paise integer not null,
  payment_method text not null default 'at_space' check (payment_method in ('at_space')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','disputed')),
  paid_via text check (paid_via is null or paid_via in ('cash','upi')),
  checkin_code text not null,
  checkin_attempts integer not null default 0,
  checked_in_at timestamptz,
  ended_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index bookings_space_idx on bookings(space_id, start_at, end_at);
create index bookings_driver_idx on bookings(driver_id, start_at);
create index bookings_pending_exp_idx on bookings(expires_at) where status = 'pending';
create index bookings_checkedin_end_idx on bookings(end_at) where status = 'checked_in';

create table reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  space_id uuid not null references spaces(id) on delete cascade,
  reviewer_id uuid not null references users(id) on delete cascade,
  reviewee_id uuid not null references users(id) on delete cascade,
  direction text not null check (direction in ('driver_to_space','host_to_driver')),
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 600),
  created_at timestamptz not null default now(),
  unique (booking_id, direction)
);
create index reviews_space_idx on reviews(space_id) where direction = 'driver_to_space';
create index reviews_reviewee_idx on reviews(reviewee_id);

create table complaints (
  id uuid primary key default gen_random_uuid(),
  filed_by uuid not null references users(id) on delete cascade,
  booking_id uuid references bookings(id) on delete set null,
  space_id uuid references spaces(id) on delete set null,
  against_user_id uuid references users(id) on delete set null,
  category text not null check (category in
    ('fake_listing','wrong_details','unsafe','no_show','overstay','payment','behaviour','other')),
  details text not null check (char_length(details) between 10 and 1000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index complaints_status_idx on complaints(status, created_at desc);
create index complaints_space_idx on complaints(space_id, category, created_at);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  driver_id uuid not null references users(id) on delete cascade,
  host_id uuid not null references users(id) on delete cascade,
  driver_last_read_at timestamptz not null default now(),
  host_last_read_at timestamptz not null default now(),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (space_id, driver_id)
);
create index conversations_driver_idx on conversations(driver_id, last_message_at desc);
create index conversations_host_idx on conversations(host_id, last_message_at desc);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  masked boolean not null default false,
  created_at timestamptz not null default now()
);
create index messages_conv_idx on messages(conversation_id, created_at);

create table otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone_hash text not null,
  code_hash text not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index otp_codes_phone_idx on otp_codes(phone_hash, created_at desc);

create table rate_events (
  id bigserial primary key,
  key text not null,
  created_at timestamptz not null default now()
);
create index rate_events_key_idx on rate_events(key, created_at);

-- Defence in depth. On Supabase, tables in the public schema are reachable through the
-- Data API with the public anon key unless row level security is on. Turning it on with
-- no policies denies that route completely; this app talks to Postgres directly instead.
alter table users enable row level security;
alter table vehicles enable row level security;
alter table spaces enable row level security;
alter table bookings enable row level security;
alter table reviews enable row level security;
alter table complaints enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table otp_codes enable row level security;
alter table rate_events enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
  end if;
end $$;
`,
  },
];
