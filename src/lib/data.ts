import "server-only";
import { createClient } from "./supabase/server";
import type { Company, Department, Employee, Location } from "./types";

/** Data induk untuk dropdown form & filter. */
export async function getLookups() {
  const supabase = await createClient();
  const [companies, departments, locations, employees] = await Promise.all([
    supabase.from("companies").select("id, code, name").order("name"),
    supabase.from("departments").select("id, company_id, name").order("name"),
    supabase.from("locations").select("id, company_id, name").order("name"),
    supabase
      .from("employees")
      .select("id, company_id, department_id, name, position, status, notes")
      .order("name"),
  ]);
  return {
    companies: (companies.data ?? []) as Company[],
    departments: (departments.data ?? []) as Department[],
    locations: (locations.data ?? []) as Location[],
    employees: (employees.data ?? []) as Employee[],
  };
}

export type Lookups = Awaited<ReturnType<typeof getLookups>>;

export function byId<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((r) => [r.id, r]));
}

/** Teks pencarian aman untuk filter .or() PostgREST */
export function searchTerm(q: string | undefined) {
  const clean = (q ?? "").replace(/[,()*%\\]/g, " ").trim();
  return clean ? `%${clean}%` : undefined;
}
