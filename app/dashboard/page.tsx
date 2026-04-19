"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AppLayout from "@/components/AppLayout";
import type { DashboardStats, Task } from "@/lib/types";
import Link from "next/link";

const priorityConfig = {
  sos: { label: "SOS", bg: "bg-red-100", text: "text-red-700", dot: "bg-red-500" },
  urgent: { label: "Επείγον", bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500" },
  normal: { label: "Κανονικό", bg: "bg-blue-100", text: "text-blue-700", dot: "bg-blue-500" },
};

const statusConfig = {
  pending: { label: "Εκκρεμεί", bg: "bg-amber-100", text: "text-amber-700" },
  in_progress: { label: "Σε εξέλιξη", bg: "bg-blue-100", text: "text-blue-700" },
  completed: { label: "Ολοκληρώθηκε", bg: "bg-green-100", text: "text-green-700" },
  cancelled: { label: "Ακυρώθηκε", bg: "bg-gray-100", text: "text-gray-500" },
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const [
        elevatorsRes,
        activeElevatorsRes,
        pendingTasksRes,
        sosTasksRes,
        urgentTasksRes,
        completedMonthRes,
        appointmentsRes,
        certExpRes,
        recentRes,
      ] = await Promise.all([
        supabase.from("elevators").select("id", { count: "exact", head: true }),
        supabase.from("elevators").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("tasks").select("id", { count: "exact", head: true }).in("status", ["pending", "in_progress"]),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("priority", "sos").in("status", ["pending", "in_progress"]),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("priority", "urgent").in("status", ["pending", "in_progress"]),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "completed").gte("completed_at", monthStart),
        supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "scheduled").gte("appointment_date", now.toISOString()),
        supabase.from("elevators").select("id", { count: "exact", head: true }).lte("certification_expiry", thirtyDaysFromNow).gte("certification_expiry", now.toISOString().split("T")[0]),
        supabase.from("tasks").select("*, elevator:elevators(address, area), assigned_user:profiles(full_name)").order("created_at", { ascending: false }).limit(5),
      ]);

      setStats({
        totalElevators: elevatorsRes.count || 0,
        activeElevators: activeElevatorsRes.count || 0,
        pendingTasks: pendingTasksRes.count || 0,
        sosTasks: sosTasksRes.count || 0,
        urgentTasks: urgentTasksRes.count || 0,
        completedThisMonth: completedMonthRes.count || 0,
        upcomingAppointments: appointmentsRes.count || 0,
        expiringCertifications: certExpRes.count || 0,
      });

      if (recentRes.data) {
        setRecentTasks(recentRes.data as unknown as Task[]);
      }
      setLoading(false);
    };

    fetchDashboard();
  }, []);

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard label="Σύνολο Ασανσέρ" value={stats?.totalElevators || 0} color="blue" />
              <StatCard label="Ενεργά" value={stats?.activeElevators || 0} color="green" />
              <StatCard label="Εκκρεμείς Εργασίες" value={stats?.pendingTasks || 0} color="amber" />
              <StatCard label="SOS Εργασίες" value={stats?.sosTasks || 0} color="red" />
              <StatCard label="Επείγοντα" value={stats?.urgentTasks || 0} color="orange" />
              <StatCard label="Ολοκληρωμένα (μήνα)" value={stats?.completedThisMonth || 0} color="emerald" />
              <StatCard label="Προσεχή Ραντεβού" value={stats?.upcomingAppointments || 0} color="violet" />
              <StatCard label="Λήξη Πιστοποίησης" value={stats?.expiringCertifications || 0} color="rose" />
            </div>

            {/* Recent Tasks */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Πρόσφατες Εργασίες</h2>
                <Link href="/tasks" className="text-sm text-blue-600 hover:underline">
                  Όλες →
                </Link>
              </div>
              {recentTasks.length === 0 ? (
                <div className="p-6 text-center text-gray-500">Δεν υπάρχουν εργασίες</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {recentTasks.map((task) => {
                    const priority = priorityConfig[task.priority];
                    const status = statusConfig[task.status];
                    return (
                      <div key={task.id} className="px-4 md:px-6 py-3 hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${priority.dot}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                            <p className="text-xs text-gray-500 truncate">
                              {(task.elevator as unknown as { address: string })?.address || "—"}
                            </p>
                            {/* Badges below title on mobile */}
                            <div className="flex items-center flex-wrap gap-2 mt-1 md:hidden">
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${priority.bg} ${priority.text}`}>
                                {priority.label}
                              </span>
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${status.bg} ${status.text}`}>
                                {status.label}
                              </span>
                            </div>
                          </div>
                          {/* Inline badges on desktop */}
                          <span className={`hidden md:inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${priority.bg} ${priority.text}`}>
                            {priority.label}
                          </span>
                          <span className={`hidden md:inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${status.bg} ${status.text}`}>
                            {status.label}
                          </span>
                          <span className="hidden md:inline text-xs text-gray-400 text-right">
                            {(task.assigned_user as unknown as { full_name: string })?.full_name || "Μη ανατεθειμένο"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    green: "bg-green-50 text-green-700 border-green-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
  };

  return (
    <div className={`rounded-xl border p-4 ${colorMap[color] || colorMap.blue}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm opacity-80 mt-1">{label}</p>
    </div>
  );
}
