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
  status: "active" | "inactive" | "maintenance";
  created_at: string;
  updated_at: string;
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
