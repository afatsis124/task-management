"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import AppLayout from "@/components/AppLayout";
import type { Elevator, Task, RepairRecord } from "@/lib/types";
import Link from "next/link";

const priorityConfig = {
  sos: { label: "SOS", bg: "bg-red-100", text: "text-red-700" },
  urgent: { label: "Επείγον", bg: "bg-amber-100", text: "text-amber-700" },
  normal: { label: "Κανονικό", bg: "bg-blue-100", text: "text-blue-700" },
};

const statusConfig = {
  pending: { label: "Εκκρεμεί", bg: "bg-amber-100", text: "text-amber-700" },
  in_progress: { label: "Σε εξέλιξη", bg: "bg-blue-100", text: "text-blue-700" },
  completed: { label: "Ολοκληρώθηκε", bg: "bg-green-100", text: "text-green-700" },
  cancelled: { label: "Ακυρώθηκε", bg: "bg-gray-100", text: "text-gray-500" },
};

type Tab = "info" | "tasks" | "repairs";

export default function ElevatorDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [elevator, setElevator] = useState<Elevator | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [repairs, setRepairs] = useState<RepairRecord[]>([]);
  const [tab, setTab] = useState<Tab>("info");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [elevatorRes, tasksRes, repairsRes] = await Promise.all([
      supabase.from("elevators").select("*").eq("id", id).single(),
      supabase
        .from("tasks")
        .select("*, assigned_user:profiles(full_name)")
        .eq("elevator_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("repair_history")
        .select("*, technician:profiles(full_name)")
        .eq("elevator_id", id)
        .order("repair_date", { ascending: false }),
    ]);

    if (elevatorRes.data) setElevator(elevatorRes.data as Elevator);
    if (tasksRes.data) setTasks(tasksRes.data as unknown as Task[]);
    if (repairsRes.data) setRepairs(repairsRes.data as unknown as RepairRecord[]);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </AppLayout>
    );
  }

  if (!elevator) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-gray-500">Δεν βρέθηκε το ασανσέρ</div>
      </AppLayout>
    );
  }

  const certExpiry = elevator.certification_expiry ? new Date(elevator.certification_expiry) : null;
  const isExpired = certExpiry && certExpiry.getTime() < Date.now();
  const isExpiringSoon = certExpiry && !isExpired && certExpiry.getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;

  const pendingTasks = tasks.filter((t) => t.status === "pending" || t.status === "in_progress").length;
  const completedTasks = tasks.filter((t) => t.status === "completed").length;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <Link href="/elevators" className="hover:text-blue-600">Ασανσέρ</Link>
          <span>/</span>
          <span className="text-gray-900">{elevator.address}</span>
        </div>

        {/* Header Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{elevator.address}</h1>
              <p className="text-sm text-gray-500 mt-1">{elevator.area}</p>
            </div>
            <div className="flex items-center gap-3 text-sm flex-shrink-0">
              <span className="font-bold text-gray-900">€{elevator.monthly_fee}/μήνα</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                elevator.status === "active" ? "bg-green-100 text-green-700" :
                elevator.status === "maintenance" ? "bg-amber-100 text-amber-700" :
                "bg-gray-100 text-gray-600"
              }`}>
                {elevator.status === "active" ? "Ενεργό" : elevator.status === "maintenance" ? "Συντήρηση" : "Ανενεργό"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <InfoItem label="Επαφή" value={elevator.contact_name} />
            <InfoItem label="Τηλέφωνο" value={elevator.contact_phone} />
            <InfoItem label="Email" value={elevator.contact_email || "—"} />
            <InfoItem label="Όροφοι" value={elevator.floors.toString()} />
            <InfoItem
              label="Τελευταία Πιστοποίηση"
              value={elevator.certification_date ? new Date(elevator.certification_date).toLocaleDateString("el-GR") : "—"}
            />
            <InfoItem
              label="Λήξη Πιστοποίησης"
              value={certExpiry ? certExpiry.toLocaleDateString("el-GR") : "—"}
              highlight={isExpired ? "red" : isExpiringSoon ? "amber" : undefined}
            />
            <InfoItem label="Εκκρεμείς" value={pendingTasks.toString()} />
            <InfoItem label="Ολοκληρωμένες" value={completedTasks.toString()} />
          </div>

          {elevator.notes && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
              <strong>Σημειώσεις:</strong> {elevator.notes}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4 overflow-x-auto">
          {([
            { key: "info", label: "Πληροφορίες" },
            { key: "tasks", label: `Εργασίες (${tasks.length})` },
            { key: "repairs", label: `Ιστορικό Επισκευών (${repairs.length})` },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition whitespace-nowrap ${
                tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "tasks" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {tasks.length === 0 ? (
              <div className="p-6 text-center text-gray-500">Δεν υπάρχουν εργασίες</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {tasks.map((task) => {
                  const priority = priorityConfig[task.priority];
                  const status = statusConfig[task.status];
                  return (
                    <div key={task.id} className="px-4 md:px-6 py-3 hover:bg-gray-50">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{task.title}</p>
                          {task.due_date && (
                            <p className="text-xs text-gray-500">Προθεσμία: {new Date(task.due_date).toLocaleDateString("el-GR")}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1 sm:hidden">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${priority.bg} ${priority.text}`}>
                              {priority.label}
                            </span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${status.bg} ${status.text}`}>
                              {status.label}
                            </span>
                          </div>
                        </div>
                        <span className={`hidden sm:inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${priority.bg} ${priority.text}`}>
                          {priority.label}
                        </span>
                        <span className={`hidden sm:inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${status.bg} ${status.text}`}>
                          {status.label}
                        </span>
                        <span className="hidden sm:inline text-xs text-gray-400 w-24 text-right">
                          {(task.assigned_user as unknown as { full_name: string })?.full_name || "—"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "repairs" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {repairs.length === 0 ? (
              <div className="p-6 text-center text-gray-500">Δεν υπάρχει ιστορικό επισκευών</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {repairs.map((repair) => (
                  <div key={repair.id} className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">{repair.description}</p>
                      <span className="text-xs text-gray-500">
                        {new Date(repair.repair_date).toLocaleDateString("el-GR")}
                      </span>
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-gray-500">
                      <span>Τεχνικός: {(repair.technician as unknown as { full_name: string })?.full_name || "—"}</span>
                      {repair.parts_used && <span>Ανταλλακτικά: {repair.parts_used}</span>}
                      {repair.cost != null && <span>Κόστος: €{repair.cost}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "info" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Σύνοψη</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
              <div>
                <p className="text-gray-500">Διεύθυνση</p>
                <p className="font-medium text-gray-900">{elevator.address}, {elevator.area}</p>
              </div>
              <div>
                <p className="text-gray-500">Επαφή</p>
                <p className="font-medium text-gray-900">{elevator.contact_name}</p>
                <p className="text-gray-600">{elevator.contact_phone}</p>
                {elevator.contact_email && <p className="text-gray-600">{elevator.contact_email}</p>}
              </div>
              <div>
                <p className="text-gray-500">Μηνιαίο Κόστος</p>
                <p className="font-medium text-gray-900">€{elevator.monthly_fee}</p>
              </div>
              <div>
                <p className="text-gray-500">Όροφοι</p>
                <p className="font-medium text-gray-900">{elevator.floors}</p>
              </div>
              <div>
                <p className="text-gray-500">Πιστοποίηση</p>
                <p className="font-medium text-gray-900">
                  {elevator.certification_date ? new Date(elevator.certification_date).toLocaleDateString("el-GR") : "—"}
                  {" → "}
                  {certExpiry ? certExpiry.toLocaleDateString("el-GR") : "—"}
                </p>
                {isExpired && <p className="text-red-600 text-xs mt-1">⚠ Η πιστοποίηση έχει λήξει!</p>}
                {isExpiringSoon && <p className="text-amber-600 text-xs mt-1">⚠ Η πιστοποίηση λήγει σύντομα</p>}
              </div>
              <div>
                <p className="text-gray-500">Ημ. Καταχώρησης</p>
                <p className="font-medium text-gray-900">{new Date(elevator.created_at).toLocaleDateString("el-GR")}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function InfoItem({ label, value, highlight }: { label: string; value: string; highlight?: "red" | "amber" }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm font-medium ${
        highlight === "red" ? "text-red-600" : highlight === "amber" ? "text-amber-600" : "text-gray-900"
      }`}>
        {value}
      </p>
    </div>
  );
}
