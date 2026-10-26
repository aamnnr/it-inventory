import type { AssetCategory, AssetStatus, EmployeeStatus } from "./categories";

export type Company = { id: string; code: string; name: string };
export type Department = { id: string; company_id: string; name: string };
export type Location = { id: string; company_id: string; name: string };

export type Employee = {
  id: string;
  company_id: string;
  department_id: string | null;
  name: string;
  position: string | null;
  status: EmployeeStatus;
  notes: string | null;
};

export type Asset = {
  id: string;
  code: string;
  company_id: string;
  category: AssetCategory;
  name: string;
  serial_number: string | null;
  hostname: string | null;
  status: AssetStatus;
  holder_employee_id: string | null;
  department_id: string | null;
  location_id: string | null;
  shared_with: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  last_cleaned_at: string | null;
  specs: Record<string, string>;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Assignment = {
  id: string;
  asset_id: string;
  employee_id: string | null;
  department_id: string | null;
  assigned_at: string;
  returned_at: string | null;
  notes: string | null;
};

/** Hasil Server Action untuk ditampilkan di form */
export type ActionState = { error?: string; ok?: string } | undefined;
