/* ───────────────────── User / Auth ───────────────────── */

export type UserRole = "admin" | "technician";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  avatar_url?: string;
  created_at: string;
}

/* ───────────────────── Elevator ───────────────────── */

export interface Elevator {
  id: string;
  address: string;
  area: string;
  contact_name: string;
  contact_phone: string;
  contact_email?: string;
  monthly_fee: number;
  certification_date: string | null;
  certification_expiry: string | null;
  floors: number;
  notes?: string;
  type: "residential" | "professional";
  status: "active" | "inactive" | "maintenance";
  registry_number?: string;
  protocol_number?: string;
  office_name?: string;
  office_address?: string;
  office_email?: string;
  office_phone?: string;
  office_hours?: string;
  created_at: string;
  updated_at: string;
}

/* ───────────────────── Spare Parts ───────────────────── */

export interface SparePart {
  id: string;
  elevator_id: string;
  installation_date: string;
  description: string;
  price_without_vat: number | null;
  price_with_vat: number | null;
  debit_number?: string;
  document_type: "sale_confirmation" | "cash_register" | null;
  receipt_number?: string;
  receipt_date: string | null;
  payment_date: string | null;
  created_at: string;
}

/* ───────────────────── Repair Documents ───────────────────── */

export interface RepairDocument {
  id: string;
  elevator_id: string;
  title: string;
  description?: string;
  pdf_url?: string;
  status: "pending" | "in_progress" | "completed";
  created_at: string;
  updated_at: string;
}

/* ───────────────────── Payments ───────────────────── */

export interface Payment {
  id: string;
  elevator_id: string;
  month: number;
  year: number;
  invoice_date: string | null;
  invoice_number?: string;
  payment_date: string | null;
  notes?: string;
  created_at: string;
}

/* ───────────────────── Task ───────────────────── */

export type TaskPriority = "sos" | "urgent" | "normal";
export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface Task {
  id: string;
  elevator_id: string;
  assigned_to: string | null;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  elevator?: Elevator;
  assigned_user?: UserProfile;
}

/* ───────────────────── Repair History ───────────────────── */

export interface RepairRecord {
  id: string;
  elevator_id: string;
  technician_id: string | null;
  task_id: string | null;
  description: string;
  parts_used?: string;
  cost?: number;
  repair_date: string;
  created_at: string;
  // Joined
  technician?: UserProfile;
}

/* ───────────────────── Appointment ───────────────────── */

export interface Appointment {
  id: string;
  elevator_id: string;
  assigned_to: string | null;
  title: string;
  description?: string;
  appointment_date: string;
  duration_minutes: number;
  status: "scheduled" | "completed" | "cancelled";
  created_at: string;
  // Joined
  elevator?: Elevator;
  assigned_user?: UserProfile;
}

/* ───────────────────── Stats ───────────────────── */

export interface DashboardStats {
  totalElevators: number;
  activeElevators: number;
  pendingTasks: number;
  sosTasks: number;
  urgentTasks: number;
  completedThisMonth: number;
  upcomingAppointments: number;
  expiringCertifications: number;
}
