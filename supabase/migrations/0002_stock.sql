-- =====================================================================
-- Inventaris IT — Fase 2: stok barang habis pakai, sparepart & tinta
-- Stok dikelola di tingkat grup (gudang IT Support KFG).
-- Jalankan di Supabase: SQL Editor → New query → paste → Run
-- =====================================================================

create type public.stock_movement_type as enum ('masuk', 'keluar', 'penyesuaian');

create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                    -- mis. INV001
  name text not null unique,
  category text not null default 'Lainnya',
  unit text not null default 'pcs',
  min_stock integer not null default 0 check (min_stock >= 0),
  location text,                                -- tempat penyimpanan, mis. "Laci Besi Lantai 2"
  printer text,                                 -- khusus tinta: merek/tipe printer
  ink_code text,                                -- khusus tinta: kode tinta, mis. 003, GI-790
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger stock_items_updated_at before update on public.stock_items
  for each row execute function public.set_updated_at();

-- Setiap perubahan stok = satu baris. quantity bertanda: masuk (+), keluar (−), penyesuaian (±).
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.stock_items (id) on delete cascade,
  type public.stock_movement_type not null,
  quantity integer not null check (quantity <> 0),
  moved_at date not null default current_date,
  unit_price numeric(14, 2) check (unit_price is null or unit_price >= 0),
  warranty text,                                -- barang masuk: info garansi
  recipient_employee_id uuid references public.employees (id) on delete set null,
  recipient_company_id uuid references public.companies (id) on delete set null,
  recipient text,                               -- barang keluar: penerima / keperluan (teks bebas)
  asset_id uuid references public.assets (id) on delete set null, -- dipasang ke aset tertentu
  notes text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (
    (type = 'masuk' and quantity > 0) or
    (type = 'keluar' and quantity < 0) or
    type = 'penyesuaian'
  )
);
create index stock_movements_item_idx on public.stock_movements (item_id);
create index stock_movements_date_idx on public.stock_movements (moved_at desc, created_at desc);

-- Stok tidak boleh minus
create function public.check_stock_not_negative() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_item uuid := coalesce(new.item_id, old.item_id);
  v_stock integer;
  v_name text;
begin
  select coalesce(sum(quantity), 0) into v_stock from public.stock_movements where item_id = v_item;
  if v_stock < 0 then
    select name into v_name from public.stock_items where id = v_item;
    raise exception 'Stok % tidak cukup (sisa akan menjadi %)', v_name, v_stock;
  end if;
  return null;
end $$;

create constraint trigger stock_not_negative
  after insert or update or delete on public.stock_movements
  deferrable initially deferred
  for each row execute function public.check_stock_not_negative();

-- Ringkasan stok per barang
create view public.stock_levels with (security_invoker = true) as
select
  i.*,
  coalesce(sum(m.quantity), 0)::integer as stock,
  coalesce(sum(m.quantity) filter (where m.type = 'masuk'), 0)::integer as total_in,
  coalesce(-sum(m.quantity) filter (where m.type = 'keluar'), 0)::integer as total_out,
  -- harga rata-rata tertimbang dari pembelian yang ada harganya
  case when sum(m.quantity) filter (where m.type = 'masuk' and m.unit_price > 0) > 0 then
    round(sum(m.unit_price * m.quantity) filter (where m.type = 'masuk' and m.unit_price > 0)
          / sum(m.quantity) filter (where m.type = 'masuk' and m.unit_price > 0), 0)
  end as avg_price,
  max(m.moved_at) as last_moved_at
from public.stock_items i
left join public.stock_movements m on m.item_id = i.id
group by i.id;

-- Kode barang berikutnya, mis. INV147
create function public.next_item_code() returns text
language sql stable security invoker set search_path = public as $$
  select 'INV' || lpad(
    (coalesce(max(nullif(regexp_replace(code, '\D', '', 'g'), '')::int), 0) + 1)::text, 3, '0')
  from public.stock_items;
$$;

-- Log aktivitas
create trigger log_stock_items after insert or update or delete on public.stock_items
  for each row execute function public.log_activity();
create trigger log_stock_movements after insert or update or delete on public.stock_movements
  for each row execute function public.log_activity();

-- RLS: semua yang login boleh melihat, hanya admin yang mengubah
alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;

do $$
declare t text;
begin
  foreach t in array array['stock_items', 'stock_movements']
  loop
    execute format('create policy "%1$s: lihat" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "%1$s: admin tambah" on public.%1$I for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy "%1$s: admin ubah" on public.%1$I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy "%1$s: admin hapus" on public.%1$I for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;
