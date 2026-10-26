-- =====================================================================
-- Inventaris IT — Fase 1: data induk, aset, serah terima, log aktivitas
-- Jalankan sekali di Supabase: Dashboard → SQL Editor → paste → Run
-- =====================================================================

-- ---------- Tipe data ----------
create type public.user_role as enum ('admin', 'viewer');
create type public.employee_status as enum ('aktif', 'pindah', 'resign');
create type public.asset_category as enum (
  'pc', 'laptop', 'monitor', 'handphone', 'simcard', 'ups', 'printer', 'cctv', 'lainnya'
);
create type public.asset_status as enum ('dipakai', 'tersedia', 'perbaikan', 'rusak', 'pensiun');

-- ---------- Helper: kolom updated_at otomatis ----------
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- Profil pengguna aplikasi ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role public.user_role not null default 'viewer',
  created_at timestamptz not null default now()
);

-- Pengguna pertama yang mendaftar otomatis jadi admin; selanjutnya viewer.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles) then 'viewer'::public.user_role
         else 'admin'::public.user_role end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- Data induk ----------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- dipakai sebagai prefix kode aset, mis. FTK
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  department_id uuid references public.departments (id) on delete set null,
  name text not null,
  position text,
  status public.employee_status not null default 'aktif',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index employees_company_idx on public.employees (company_id);
create trigger employees_updated_at before update on public.employees
  for each row execute function public.set_updated_at();

-- ---------- Aset ----------
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                   -- mis. FTK-PC-001
  company_id uuid not null references public.companies (id),
  category public.asset_category not null,
  name text not null,                          -- merek / tipe, mis. "Infinix HOT 50i"
  serial_number text,
  hostname text,
  status public.asset_status not null default 'tersedia',
  -- Pemegang saat ini (diisi lewat fungsi assign_asset / return_asset)
  holder_employee_id uuid references public.employees (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  location_id uuid references public.locations (id) on delete set null,
  shared_with text,                            -- pemakai lain bila dipakai bersama
  purchase_date date,
  purchase_price numeric(14, 2),
  last_cleaned_at date,
  specs jsonb not null default '{}'::jsonb,    -- spesifikasi sesuai kategori
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assets_company_idx on public.assets (company_id);
create index assets_category_idx on public.assets (category);
create index assets_holder_idx on public.assets (holder_employee_id);
create trigger assets_updated_at before update on public.assets
  for each row execute function public.set_updated_at();

-- Data sensitif (NIK, KK, password NVR, dll) disimpan TERENKRIPSI oleh aplikasi
-- (AES-256-GCM, kunci di env SECRETS_KEY) dan hanya bisa dibaca admin.
create table public.asset_secrets (
  asset_id uuid primary key references public.assets (id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);
create trigger asset_secrets_updated_at before update on public.asset_secrets
  for each row execute function public.set_updated_at();

-- Riwayat serah terima
create table public.asset_assignments (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  assigned_at date not null default current_date,
  returned_at date,
  notes text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (returned_at is null or returned_at >= assigned_at)
);
create index asset_assignments_asset_idx on public.asset_assignments (asset_id);
create index asset_assignments_employee_idx on public.asset_assignments (employee_id);
-- Satu aset hanya boleh punya satu serah terima yang masih aktif
create unique index asset_assignments_one_open
  on public.asset_assignments (asset_id) where returned_at is null;

-- ---------- Serah terima: fungsi atomik ----------
create function public.assign_asset(
  p_asset_id uuid,
  p_employee_id uuid,
  p_department_id uuid,
  p_date date,
  p_notes text
) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang boleh melakukan serah terima';
  end if;
  if p_employee_id is null and p_department_id is null then
    raise exception 'Pilih karyawan atau departemen penerima';
  end if;

  update public.asset_assignments
     set returned_at = greatest(p_date, assigned_at)
   where asset_id = p_asset_id and returned_at is null;

  insert into public.asset_assignments (asset_id, employee_id, department_id, assigned_at, notes)
  values (p_asset_id, p_employee_id, p_department_id, p_date, p_notes);

  update public.assets
     set holder_employee_id = p_employee_id,
         department_id = coalesce(
           p_department_id,
           (select department_id from public.employees where id = p_employee_id),
           department_id),
         status = 'dipakai'
   where id = p_asset_id;
end $$;

create function public.return_asset(
  p_asset_id uuid,
  p_date date,
  p_new_status public.asset_status,
  p_notes text
) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang boleh melakukan pengembalian';
  end if;

  update public.asset_assignments
     set returned_at = greatest(p_date, assigned_at),
         notes = case when p_notes is null or p_notes = '' then notes
                      else concat_ws(' | ', notes, 'Kembali: ' || p_notes) end
   where asset_id = p_asset_id and returned_at is null;

  update public.assets
     set holder_employee_id = null,
         shared_with = null,
         status = coalesce(p_new_status, 'tersedia')
   where id = p_asset_id;
end $$;

-- Nomor urut kode aset berikutnya, mis. next_asset_code('FTK', 'PC') → FTK-PC-013
create function public.next_asset_code(p_company_code text, p_prefix text) returns text
language sql stable security invoker set search_path = public as $$
  select p_company_code || '-' || p_prefix || '-' || lpad(
    (coalesce(max(nullif(regexp_replace(split_part(code, '-', 3), '\D', '', 'g'), '')::int), 0) + 1)::text,
    3, '0')
  from public.assets
  where code like p_company_code || '-' || p_prefix || '-%';
$$;

-- ---------- Log aktivitas ----------
create table public.activity_log (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid(),
  table_name text not null,
  record_id uuid,
  action text not null,                 -- INSERT / UPDATE / DELETE
  changes jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_record_idx on public.activity_log (record_id);
create index activity_log_created_idx on public.activity_log (created_at desc);

create function public.log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_changes jsonb;
  v_id uuid;
begin
  if tg_table_name = 'asset_secrets' then
    -- jangan pernah simpan isi data sensitif di log
    v_changes := null;
    v_id := coalesce(v_new ->> 'asset_id', v_old ->> 'asset_id')::uuid;
  else
    v_id := coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid);
    if tg_op = 'UPDATE' then
      select jsonb_object_agg(key, jsonb_build_object('dari', v_old -> key, 'ke', value))
        into v_changes
        from jsonb_each(v_new)
       where key not in ('updated_at') and v_old -> key is distinct from value;
      if v_changes is null then
        return new;
      end if;
    else
      v_changes := coalesce(v_new, v_old);
    end if;
  end if;

  insert into public.activity_log (user_id, table_name, record_id, action, changes)
  values (auth.uid(), tg_table_name, v_id, tg_op, v_changes);
  return coalesce(new, old);
end $$;

create trigger log_assets after insert or update or delete on public.assets
  for each row execute function public.log_activity();
create trigger log_asset_assignments after insert or update or delete on public.asset_assignments
  for each row execute function public.log_activity();
create trigger log_employees after insert or update or delete on public.employees
  for each row execute function public.log_activity();
create trigger log_asset_secrets after insert or update or delete on public.asset_secrets
  for each row execute function public.log_activity();

-- ---------- Row Level Security ----------
-- Semua pengguna yang login boleh MELIHAT; hanya admin yang boleh MENGUBAH.
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.departments enable row level security;
alter table public.locations enable row level security;
alter table public.employees enable row level security;
alter table public.assets enable row level security;
alter table public.asset_secrets enable row level security;
alter table public.asset_assignments enable row level security;
alter table public.activity_log enable row level security;

create policy "profil: lihat" on public.profiles
  for select to authenticated using (true);
create policy "profil: admin ubah" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['companies', 'departments', 'locations', 'employees', 'assets', 'asset_assignments']
  loop
    execute format('create policy "%1$s: lihat" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "%1$s: admin tambah" on public.%1$I for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy "%1$s: admin ubah" on public.%1$I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy "%1$s: admin hapus" on public.%1$I for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

create policy "secrets: hanya admin" on public.asset_secrets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "log: admin lihat" on public.activity_log
  for select to authenticated using (public.is_admin());
