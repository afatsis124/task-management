"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import AppLayout from "@/components/AppLayout";
import type { Task, Elevator, UserProfile, TaskPriority, TaskStatus } from "@/lib/types";

const priorityConfig = {
  sos: { label: "SOS", bg: "bg-red-100", text: "text-red-700", dot: "bg-red-500", ring: "ring-red-200" },
  urgent: { label: "Επείγον", bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500", ring: "ring-amber-200" },
  normal: { label: "Κανονικό", bg: "bg-blue-100", text: "text-blue-700", dot: "bg-blue-500", ring: "ring-blue-200" },
};

const statusConfig = {
  pending: { label: "Εκκρεμεί", bg: "bg-amber-100", text: "text-amber-700" },
  in_progress: { label: "Σε εξέλιξη", bg: "bg-blue-100", text: "text-blue-700" },
  completed: { label: "Ολοκληρώθηκε", bg: "bg-green-100", text: "text-green-700" },
  cancelled: { label: "Ακυρώθηκε", bg: "bg-gray-100", text: "text-gray-500" },
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);

  // Filters
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Form
  const [form, setForm] = useState({
    elevator_id: "",
    assigned_to: "",
    title: "",
    description: "",
    priority: "normal" as TaskPriority,
    status: "pending" as TaskStatus,
    due_date: "",
    notify_sms: false,
    notify_email: false,
  });

  const fetchData = useCallback(async () => {
    const [tasksRes, elevatorsRes, usersRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("*, elevator:elevators(id, address, area), assigned_user:profiles(id, full_name)")
        .order("created_at", { ascending: false }),
      supabase.from("elevators").select("id, address, area").order("address"),
      supabase.from("profiles").select("id, full_name, role, phone, email"),
    ]);

    if (tasksRes.data) setTasks(tasksRes.data as unknown as Task[]);
    if (elevatorsRes.data) setElevators(elevatorsRes.data as Elevator[]);
    if (usersRes.data) setUsers(usersRes.data as UserProfile[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resetForm = () => {
    setForm({
      elevator_id: "",
      assigned_to: "",
      title: "",
      description: "",
      priority: "normal",
      status: "pending",
      due_date: "",
      notify_sms: false,
      notify_email: false,
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload = {
      elevator_id: form.elevator_id,
      assigned_to: form.assigned_to || null,
      title: form.title,
      description: form.description || null,
      priority: form.priority,
      status: form.status,
      due_date: form.due_date || null,
      completed_at: form.status === "completed" ? new Date().toISOString() : null,
    };

    if (editing) {
      await supabase.from("tasks").update(payload).eq("id", editing.id);
    } else {
      await supabase.from("tasks").insert(payload);
    }

    if (form.assigned_to && (form.notify_sms || form.notify_email)) {
      const assignee = users.find((u) => u.id === form.assigned_to);
      const elevator = elevators.find((e) => e.id === form.elevator_id);
      const elevatorAddress = elevator ? `${elevator.address}, ${elevator.area}` : "";
      if (assignee) {
        const priorityLabel = form.priority === "sos" ? "SOS" : form.priority === "urgent" ? "Επείγον" : "Κανονικό";
        if (form.notify_sms && assignee.phone) {
          await fetch("/api/send-sms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: assignee.phone,
              taskTitle: form.title,
              assigneeName: assignee.full_name || assignee.email,
              priority: priorityLabel,
              elevatorAddress,
            }),
          }).catch((err) => console.error("SMS failed:", err));
        }
        if (form.notify_email && assignee.email) {
          await fetch("/api/send-task-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: assignee.email,
              taskTitle: form.title,
              assigneeName: assignee.full_name || assignee.email,
              priority: priorityLabel,
              description: form.description,
              due_date: form.due_date,
              elevatorAddress,
            }),
          }).catch((err) => console.error("Email failed:", err));
        }
      }
    }

    setShowForm(false);
    setEditing(null);
    resetForm();
    setSaving(false);
    fetchData();
  };

  const openEdit = (task: Task) => {
    setEditing(task);
    setForm({
      elevator_id: task.elevator_id,
      assigned_to: task.assigned_to || "",
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      status: task.status,
      due_date: task.due_date || "",
      notify_sms: false,
      notify_email: false,
    });
    setShowForm(true);
  };

  const updateStatus = async (task: Task, newStatus: TaskStatus) => {
    const update: Record<string, unknown> = { status: newStatus };
    if (newStatus === "completed") update.completed_at = new Date().toISOString();
    if (newStatus !== "completed") update.completed_at = null;
    await supabase.from("tasks").update(update).eq("id", task.id);
    fetchData();
  };

  const filtered = tasks.filter((t) => {
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      const addr = (t.elevator as unknown as { address: string })?.address || "";
      return t.title.toLowerCase().includes(s) || addr.toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Εργασίες</h1>
          <button
            onClick={() => {
              setEditing(null);
              resetForm();
              setShowForm(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
          >
            + Νέα Εργασία
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-4">
          <input
            type="text"
            placeholder="Αναζήτηση..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
          />
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
          >
            <option value="all">Όλες οι Προτεραιότητες</option>
            <option value="sos">SOS</option>
            <option value="urgent">Επείγον</option>
            <option value="normal">Κανονικό</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
          >
            <option value="all">Όλες οι Καταστάσεις</option>
            <option value="pending">Εκκρεμεί</option>
            <option value="in_progress">Σε εξέλιξη</option>
            <option value="completed">Ολοκληρώθηκε</option>
            <option value="cancelled">Ακυρώθηκε</option>
          </select>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                {editing ? "Επεξεργασία Εργασίας" : "Νέα Εργασία"}
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Επέλεξε ασανσέρ</option>
                    {elevators.map((el) => (
                      <option key={el.id} value={el.id}>
                        {el.address} ({el.area})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Προτεραιότητα</label>
                    <div className="flex gap-2">
                      {(["sos", "urgent", "normal"] as const).map((p) => {
                        const cfg = priorityConfig[p];
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setForm({ ...form, priority: p })}
                            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-lg border transition ${
                              form.priority === p
                                ? `${cfg.bg} ${cfg.text} ring-2 ${cfg.ring}`
                                : "bg-gray-50 text-gray-500 border-gray-200"
                            }`}
                          >
                            {cfg.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Κατάσταση</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="pending">Εκκρεμεί</option>
                      <option value="in_progress">Σε εξέλιξη</option>
                      <option value="completed">Ολοκληρώθηκε</option>
                      <option value="cancelled">Ακυρώθηκε</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ανάθεση σε</label>
                    <select
                      value={form.assigned_to}
                      onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">Χωρίς ανάθεση</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name || u.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Προθεσμία</label>
                    <input
                      type="date"
                      value={form.due_date}
                      onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Περιγραφή</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="border-t border-gray-100 pt-3">
                  <p className="text-sm font-medium text-gray-700 mb-2">Ειδοποίηση</p>
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.notify_sms}
                        onChange={(e) => setForm({ ...form, notify_sms: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">SMS</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.notify_email}
                        onChange={(e) => setForm({ ...form, notify_email: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Email</span>
                    </label>
                  </div>
                  {(form.notify_sms || form.notify_email) && !form.assigned_to && (
                    <p className="text-xs text-amber-600 mt-1">Επέλεξε χρήστη για να σταλεί ειδοποίηση.</p>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); setEditing(null); }}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Ακύρωση
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    {saving ? "Αποθήκευση..." : "Αποθήκευση"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Tasks List */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-500">Δεν βρέθηκαν εργασίες</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((task) => {
              const priority = priorityConfig[task.priority];
              const status = statusConfig[task.status];
              const elevator = task.elevator as unknown as { address: string; area: string } | null;
              const assignee = task.assigned_user as unknown as { full_name: string } | null;
              const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "completed" && task.status !== "cancelled";

              return (
                <div
                  key={task.id}
                  className={`bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition ${
                    task.priority === "sos" ? "border-l-4 border-l-red-500" :
                    task.priority === "urgent" ? "border-l-4 border-l-amber-500" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Quick complete */}
                    <div className="flex-shrink-0 mt-0.5">
                      {task.status !== "completed" && task.status !== "cancelled" && (
                        <button
                          onClick={() => updateStatus(task, "completed")}
                          className="w-5 h-5 rounded-full border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 transition"
                          title="Ολοκλήρωση"
                        />
                      )}
                      {task.status === "completed" && (
                        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-medium ${task.status === "completed" ? "text-gray-400 line-through" : "text-gray-900"}`}>
                          {task.title}
                        </p>
                        {isOverdue && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-600 rounded">
                            ΕΚΠΡΟΘΕΣΜΗ
                          </span>
                        )}
                      </div>
                      <div className="flex items-center flex-wrap gap-2 mt-1 text-xs text-gray-500">
                        {elevator && <span>{elevator.address}</span>}
                        {task.due_date && (
                          <span className={isOverdue ? "text-red-500" : ""}>
                            Προθεσμία: {new Date(task.due_date).toLocaleDateString("el-GR")}
                          </span>
                        )}
                        {assignee && <span className="sm:hidden">{assignee.full_name}</span>}
                      </div>
                      {/* Badges below on mobile */}
                      <div className="flex items-center gap-2 mt-1 sm:hidden">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${priority.bg} ${priority.text}`}>
                          {priority.label}
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${status.bg} ${status.text}`}>
                          {status.label}
                        </span>
                      </div>
                    </div>

                    {/* Inline on desktop */}
                    <span className={`hidden sm:inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${priority.bg} ${priority.text}`}>
                      {priority.label}
                    </span>
                    <span className={`hidden sm:inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${status.bg} ${status.text}`}>
                      {status.label}
                    </span>
                    {assignee && (
                      <span className="hidden sm:inline text-xs text-gray-500 w-28 text-right truncate">
                        {assignee.full_name}
                      </span>
                    )}

                    <button
                      onClick={() => openEdit(task)}
                      className="text-gray-400 hover:text-blue-600 transition flex-shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
