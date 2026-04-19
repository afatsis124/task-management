"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import AppLayout from "@/components/AppLayout";
import type { Appointment, Elevator, UserProfile } from "@/lib/types";

const statusLabels: Record<string, { label: string; color: string }> = {
  scheduled: { label: "Προγραμματισμένο", color: "bg-blue-100 text-blue-700" },
  completed: { label: "Ολοκληρώθηκε", color: "bg-green-100 text-green-700" },
  cancelled: { label: "Ακυρώθηκε", color: "bg-gray-100 text-gray-500" },
};

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [form, setForm] = useState({
    elevator_id: "",
    assigned_to: "",
    title: "",
    description: "",
    appointment_date: "",
    appointment_time: "09:00",
    duration_minutes: "60",
    status: "scheduled" as "scheduled" | "completed" | "cancelled",
  });

  const fetchData = useCallback(async () => {
    const [year, month] = filterMonth.split("-").map(Number);
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

    const [appointmentsRes, elevatorsRes, usersRes] = await Promise.all([
      supabase
        .from("appointments")
        .select("*, elevator:elevators(id, address, area), assigned_user:profiles(id, full_name)")
        .gte("appointment_date", startDate)
        .lte("appointment_date", endDate)
        .order("appointment_date", { ascending: true }),
      supabase.from("elevators").select("id, address, area").order("address"),
      supabase.from("profiles").select("id, full_name, role"),
    ]);

    if (appointmentsRes.data) setAppointments(appointmentsRes.data as unknown as Appointment[]);
    if (elevatorsRes.data) setElevators(elevatorsRes.data as Elevator[]);
    if (usersRes.data) setUsers(usersRes.data as UserProfile[]);
    setLoading(false);
  }, [filterMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resetForm = () => {
    setForm({
      elevator_id: "",
      assigned_to: "",
      title: "",
      description: "",
      appointment_date: "",
      appointment_time: "09:00",
      duration_minutes: "60",
      status: "scheduled",
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const dateTime = new Date(`${form.appointment_date}T${form.appointment_time}`);

    const payload = {
      elevator_id: form.elevator_id,
      assigned_to: form.assigned_to || null,
      title: form.title,
      description: form.description || null,
      appointment_date: dateTime.toISOString(),
      duration_minutes: parseInt(form.duration_minutes) || 60,
      status: form.status,
    };

    if (editing) {
      await supabase.from("appointments").update(payload).eq("id", editing.id);
    } else {
      await supabase.from("appointments").insert(payload);
    }

    setShowForm(false);
    setEditing(null);
    resetForm();
    setSaving(false);
    fetchData();
  };

  const openEdit = (apt: Appointment) => {
    setEditing(apt);
    const d = new Date(apt.appointment_date);
    setForm({
      elevator_id: apt.elevator_id,
      assigned_to: apt.assigned_to || "",
      title: apt.title,
      description: apt.description || "",
      appointment_date: d.toISOString().split("T")[0],
      appointment_time: d.toTimeString().slice(0, 5),
      duration_minutes: apt.duration_minutes.toString(),
      status: apt.status,
    });
    setShowForm(true);
  };

  // Group by day
  const grouped = appointments.reduce<Record<string, Appointment[]>>((acc, apt) => {
    const day = new Date(apt.appointment_date).toLocaleDateString("el-GR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    if (!acc[day]) acc[day] = [];
    acc[day].push(apt);
    return acc;
  }, {});

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Ραντεβού</h1>
          <button
            onClick={() => {
              setEditing(null);
              resetForm();
              setShowForm(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
          >
            + Νέο Ραντεβού
          </button>
        </div>

        {/* Month filter */}
        <div className="mb-4">
          <input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                {editing ? "Επεξεργασία" : "Νέο Ραντεβού"}
              </h2>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Τίτλος *</label>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ασανσέρ *</label>
                  <select
                    required
                    value={form.elevator_id}
                    onChange={(e) => setForm({ ...form, elevator_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                  >
                    <option value="">Επέλεξε ασανσέρ</option>
                    {elevators.map((el) => (
                      <option key={el.id} value={el.id}>{el.address} ({el.area})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ημερομηνία *</label>
                    <input
                      type="date"
                      required
                      value={form.appointment_date}
                      onChange={(e) => setForm({ ...form, appointment_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ώρα</label>
                    <input
                      type="time"
                      value={form.appointment_time}
                      onChange={(e) => setForm({ ...form, appointment_time: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Διάρκεια (λεπτά)</label>
                    <input
                      type="number"
                      value={form.duration_minutes}
                      onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ανάθεση σε</label>
                    <select
                      value={form.assigned_to}
                      onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                    >
                      <option value="">—</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Κατάσταση</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as "scheduled" | "completed" | "cancelled" })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                    >
                      <option value="scheduled">Προγραμματισμένο</option>
                      <option value="completed">Ολοκληρώθηκε</option>
                      <option value="cancelled">Ακυρώθηκε</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Περιγραφή</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 text-sm text-gray-600">
                    Ακύρωση
                  </button>
                  <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                    {saving ? "Αποθήκευση..." : "Αποθήκευση"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Appointments grouped by day */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-20 text-gray-500">Δεν υπάρχουν ραντεβού αυτόν τον μήνα</div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([day, apts]) => (
              <div key={day}>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">{day}</h3>
                <div className="space-y-2">
                  {apts.map((apt) => {
                    const st = statusLabels[apt.status];
                    const d = new Date(apt.appointment_date);
                    const elevator = apt.elevator as unknown as { address: string; area: string } | null;
                    const assignee = apt.assigned_user as unknown as { full_name: string } | null;

                    return (
                      <div key={apt.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition">
                        <div className="flex items-center gap-4">
                          <div className="text-center w-14 flex-shrink-0">
                            <p className="text-lg font-bold text-blue-600">
                              {d.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                            <p className="text-[10px] text-gray-400">{apt.duration_minutes} λεπτά</p>
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{apt.title}</p>
                            <p className="text-xs text-gray-500">
                              {elevator ? `${elevator.address}, ${elevator.area}` : "—"}
                            </p>
                          </div>

                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${st.color}`}>
                            {st.label}
                          </span>

                          {assignee && (
                            <span className="text-xs text-gray-500">{assignee.full_name}</span>
                          )}

                          <button onClick={() => openEdit(apt)} className="text-gray-400 hover:text-blue-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
