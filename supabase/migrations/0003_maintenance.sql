-- =====================================================================
-- Inventaris IT — Fase 3: maintenance, langganan & lisensi, laptop pribadi
-- Jalankan di Supabase: SQL Editor → New query → paste → Run (role: postgres)
-- =====================================================================

-- ---------- Maintenance aset ----------
create type public.maintenance_type as enum ('pembersihan', 'service', 'perbaikan', 'upgrade', 'pengecekan');

-- Interval maintenance rutin per kategori aset (dalam bulan)
create table public.maintenance_intervals (
  category public.asset_category primary key,
  months integer not null check (months between 1 and 60)
);
insert into public.maintenance_intervals (category, months) values
  ('pc', 6), ('laptop', 6), ('printer', 3), ('ups', 12), ('cctv', 12);

create table public.maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets (id) on delete cascade,
  type public.maintenance_type not null default 'pembersihan',
  performed_at date not null default current_date,
  description text not null,
  cost numeric(14, 2) check (cost is null or cost >= 0),
  performed_by text,                 -- teknisi / vendor
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index maintenance_logs_asset_idx on public.maintenance_logs (asset_id, performed_at desc);

-- Pembersihan ikut memperbarui kolom "terakhir dibersihkan" di aset
create function public.sync_last_cleaned() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'pembersihan' then
    update public.assets
       set last_cleaned_at = greatest(coalesce(last_cleaned_at, new.performed_at), new.performed_at)
     where id = new.asset_id;
  end if;
  return new;
end $$;
create trigger maintenance_sync_last_cleaned after insert on public.maintenance_logs
  for each row execute function public.sync_last_cleaned();

-- Status jadwal maintenance per aset (hanya kategori yang punya interval)
create view public.maintenance_schedule with (security_invoker = true) as
select
  a.id as asset_id,
  a.code,
  a.name,
  a.category,
  a.company_id,
  a.holder_employee_id,
  a.status,
  i.months as interval_months,
  greatest(max(l.performed_at), a.last_cleaned_at) as last_done,
  (greatest(max(l.performed_at), a.last_cleaned_at) + make_interval(months => i.months))::date as next_due
from public.assets a
join public.maintenance_intervals i on i.category = a.category
left join public.maintenance_logs l on l.asset_id = a.id
where a.status <> 'pensiun'
group by a.id, i.months;

-- ---------- Langganan & lisensi ----------
create type public.subscription_kind as enum ('internet', 'lisensi', 'domain_hosting', 'lainnya');
create type public.billing_cycle as enum ('bulanan', 'tahunan', 'sekali');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind public.subscription_kind not null default 'lainnya',
  company_id uuid references public.companies (id) on delete set null,
  vendor text,
  account_number text,               -- ID / nomor pelanggan
  billing_cycle public.billing_cycle not null default 'bulanan',
  amount numeric(14, 2) check (amount is null or amount >= 0),
  start_date date,
  next_due_date date,                -- jatuh tempo berikutnya
  contact text,                      -- nomor terkait / kontak vendor
  email text,                        -- email akun terkait
  description text,                  -- benefit, mis. "Internet up to 300 Mbps"
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  paid_at date not null default current_date,
  period_due date,                   -- jatuh tempo yang dibayar
  amount numeric(14, 2) check (amount is null or amount >= 0),
  notes text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index subscription_payments_sub_idx on public.subscription_payments (subscription_id, paid_at desc);

-- Catat pembayaran lalu majukan jatuh tempo 1 bulan / 1 tahun (sekali bayar → nonaktif)
create function public.pay_subscription(
  p_subscription_id uuid,
  p_paid_at date,
  p_amount numeric,
  p_notes text
) returns date
language plpgsql security invoker set search_path = public as $$
declare
  v_sub public.subscriptions;
  v_next date;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang boleh mencatat pembayaran';
  end if;
  select * into v_sub from public.subscriptions where id = p_subscription_id for update;
  if not found then
    raise exception 'Langganan tidak ditemukan';
  end if;

  insert into public.subscription_payments (subscription_id, paid_at, period_due, amount, notes)
  values (p_subscription_id, p_paid_at, v_sub.next_due_date, coalesce(p_amount, v_sub.amount), p_notes);

  v_next := case v_sub.billing_cycle
    when 'bulanan' then (coalesce(v_sub.next_due_date, p_paid_at) + interval '1 month')::date
    when 'tahunan' then (coalesce(v_sub.next_due_date, p_paid_at) + interval '1 year')::date
    else null
  end;
  update public.subscriptions
     set next_due_date = v_next,
         active = v_sub.billing_cycle <> 'sekali'
   where id = p_subscription_id;
  return v_next;
end $$;

-- ---------- Laptop pribadi karyawan & perbaikannya ----------
create table public.personal_devices (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  device text,                       -- mis. "ASUS Vivobook 14"
  notes text,
  created_at timestamptz not null default now()
);
create index personal_devices_employee_idx on public.personal_devices (employee_id);

create table public.personal_repairs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.personal_devices (id) on delete cascade,
  repaired_at date not null default current_date,
  session text,                      -- mis. "Perbaikan 1"
  item text not null,                -- mis. "RAM DDR4 3200MHz"
  cost numeric(14, 2) check (cost is null or cost >= 0),
  notes text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index personal_repairs_device_idx on public.personal_repairs (device_id, repaired_at desc);

-- ---------- Log aktivitas & RLS ----------
create trigger log_maintenance_logs after insert or update or delete on public.maintenance_logs
  for each row execute function public.log_activity();
create trigger log_subscriptions after insert or update or delete on public.subscriptions
  for each row execute function public.log_activity();
create trigger log_subscription_payments after insert or update or delete on public.subscription_payments
  for each row execute function public.log_activity();
create trigger log_personal_devices after insert or update or delete on public.personal_devices
  for each row execute function public.log_activity();
create trigger log_personal_repairs after insert or update or delete on public.personal_repairs
  for each row execute function public.log_activity();

do $$
declare t text;
begin
  foreach t in array array[
    'maintenance_intervals', 'maintenance_logs', 'subscriptions', 'subscription_payments',
    'personal_devices', 'personal_repairs'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s: lihat" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "%1$s: admin tambah" on public.%1$I for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy "%1$s: admin ubah" on public.%1$I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy "%1$s: admin hapus" on public.%1$I for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;
