"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import AppLayout from "@/components/AppLayout";
import type { UserProfile } from "@/lib/types";

export default function TeamPage() {
  const [members, setMembers] = useState<(UserProfile & { task_count?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRole, setEditingRole] = useState<string | null>(null);

  const fetchTeam = useCallback(async () => {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .order("full_name");

    if (profiles) {
      // Get task counts per user
      const { data: taskCounts } = await supabase
        .from("tasks")
        .select("assigned_to")
        .in("status", ["pending", "in_progress"]);

      const countMap: Record<string, number> = {};
      taskCounts?.forEach((t) => {
        if (t.assigned_to) {
          countMap[t.assigned_to] = (countMap[t.assigned_to] || 0) + 1;
        }
      });

      setMembers(
        (profiles as UserProfile[]).map((p) => ({
          ...p,
          task_count: countMap[p.id] || 0,
        }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const updateRole = async (userId: string, newRole: "admin" | "technician") => {
    await supabase.from("profiles").update({ role: newRole }).eq("id", userId);
    setEditingRole(null);
    fetchTeam();
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Ομάδα</h1>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-20 text-gray-500">Δεν υπάρχουν μέλη</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Μέλος</th>
                  <th className="px-6 py-3">Ρόλος</th>
                  <th className="px-6 py-3">Τηλέφωνο</th>
                  <th className="px-6 py-3">Ενεργές Εργασίες</th>
                  <th className="px-6 py-3">Εγγραφή</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-medium">
                          {(member.full_name || member.email)[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{member.full_name || "—"}</p>
                          <p className="text-xs text-gray-500">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {editingRole === member.id ? (
                        <select
                          defaultValue={member.role}
                          onChange={(e) => updateRole(member.id, e.target.value as "admin" | "technician")}
                          onBlur={() => setEditingRole(null)}
                          autoFocus
                          className="text-sm border border-gray-300 rounded px-2 py-1 outline-none"
                        >
                          <option value="admin">Admin</option>
                          <option value="technician">Τεχνικός</option>
                        </select>
                      ) : (
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full cursor-pointer ${
                            member.role === "admin"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                          onClick={() => setEditingRole(member.id)}
                          title="Κλικ για αλλαγή ρόλου"
                        >
                          {member.role === "admin" ? "Admin" : "Τεχνικός"}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{member.phone || "—"}</td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-medium ${
                        (member.task_count || 0) > 5 ? "text-red-600" :
                        (member.task_count || 0) > 2 ? "text-amber-600" : "text-gray-900"
                      }`}>
                        {member.task_count || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">
                      {new Date(member.created_at).toLocaleDateString("el-GR")}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setEditingRole(member.id)}
                        className="text-sm text-gray-500 hover:text-blue-600"
                      >
                        Επεξεργασία
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
