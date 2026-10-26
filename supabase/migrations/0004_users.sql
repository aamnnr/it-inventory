-- =====================================================================
-- Inventaris IT — Fase 4: kelola pengguna dari aplikasi
-- Jalankan di Supabase: SQL Editor → New query → paste → Run (role: postgres)
-- =====================================================================

-- Simpan email di profil agar bisa ditampilkan di halaman Kelola Pengguna
alter table public.profiles add column email text;
update public.profiles p set email = u.email from auth.users u where u.id = p.id;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    case when exists (select 1 from public.profiles) then 'viewer'::public.user_role
         else 'admin'::public.user_role end
  );
  return new;
end $$;

-- Setiap pengguna boleh mengubah namanya sendiri
create policy "profil: ubah nama sendiri" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Penjaga: hanya admin yang boleh mengubah peran, email tidak bisa diubah dari aplikasi,
-- dan admin terakhir tidak boleh diturunkan (agar sistem tidak terkunci)
create function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if not public.is_admin() then
      raise exception 'Hanya admin yang boleh mengubah peran pengguna';
    end if;
    if old.role = 'admin'
       and (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'Minimal harus ada satu admin';
    end if;
  end if;
  if new.email is distinct from old.email and auth.uid() is not null then
    new.email := old.email;
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();
