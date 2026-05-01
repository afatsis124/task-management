"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import AppLayout from "@/components/AppLayout";
import type { Elevator } from "@/lib/types";

interface MaintenanceSchedule {
  id: string;
  elevator_id: string;
  frequency_months: 1 | 2 | 3 | 12;
}

interface MaintenanceRecord {
  id: string;
  elevator_id: string;
  month: number;
  year: number;
  done_at: string | null;
  notes: string | null;
}

interface ElevatorRow {
  elevator: Elevator;
  schedule: MaintenanceSchedule | null;
  record: MaintenanceRecord | null;
  isDue: boolean;
}

const FREQUENCY_LABELS: Record<number, string> = {
  1: "Κάθε μήνα",
  2: "Κάθε 2 μήνες",
  3: "Κάθε 3 μήνες",
  12: "Κάθε χρόνο",
};

function isDueThisMonth(frequency: number, month: number): boolean {
  return month % frequency === 0;
}

export default function MaintenancePage() {
  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const fetchData = useCallback(async () => {
    const [elevatorsRes, schedulesRes, recordsRes] = await Promise.all([
      supabase.from("elevators").select("*").eq("status", "active").order("address"),
      supabase.from("maintenance_schedules").select("*"),
      supabase
        .from("maintenance_records")
        .select("*")
        .eq("month", selectedMonth)
        .eq("year", selectedYear),
    ]);

    if (elevatorsRes.data) setElevators(elevatorsRes.data as Elevator[]);
    if (schedulesRes.data) setSchedules(schedulesRes.data as MaintenanceSchedule[]);
    if (recordsRes.data) setRecords(recordsRes.data as MaintenanceRecord[]);
    setLoading(false);
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateFrequency = async (elevatorId: string, frequency: number) => {
    const existing = schedules.find((s) => s.elevator_id === elevatorId);
    if (existing) {
      await supabase
        .from("maintenance_schedules")
        .update({ frequency_months: frequency })
        .eq("id", existing.id);
    } else {
      await supabase.from("maintenance_schedules").insert({
        elevator_id: elevatorId,
        frequency_months: frequency,
      });
    }
    fetchData();
  };

  const toggleDone = async (elevatorId: string, currentRecord: MaintenanceRecord | null) => {
    setSaving(elevatorId);
    if (currentRecord) {
      if (currentRecord.done_at) {
        await supabase
          .from("maintenance_records")
          .update({ done_at: null })
          .eq("id", currentRecord.id);
      } else {
        await supabase
          .from("maintenance_records")
          .update({ done_at: new Date().toISOString().split("T")[0] })
          .eq("id", currentRecord.id);
      }
    } else {
      await supabase.from("maintenance_records").insert({
        elevator_id: elevatorId,
        month: selectedMonth,
        year: selectedYear,
        done_at: new Date().toISOString().split("T")[0],
      });
    }
    await fetchData();
    setSaving(null);
  };

  const rows: ElevatorRow[] = elevators.map((elevator) => {
    const schedule = schedules.find((s) => s.elevator_id === elevator.id) || null;
    const frequency = schedule?.frequency_months ?? 1;
    const isDue = isDueThisMonth(frequency, selectedMonth);
    const record = records.find((r) => r.elevator_id === elevator.id) || null;
    return { elevator, schedule, record, isDue };
  });

  const dueRows = rows.filter((r) => r.isDue);
  const doneCount = dueRows.filter((r) => r.record?.done_at).length;
  const totalDue = dueRows.length;
  const progressPct = totalDue > 0 ? Math.round((doneCount / totalDue) * 100) : 0;

  const monthName = new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString("el-GR", {
    month: "long",
    year: "numeric",
  });

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Συντηρήσεις</h1>

          {/* Month / Year selectors */}
          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1, 1).toLocaleDateString("el-GR", { month: "long" })}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Progress bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 capitalize">{monthName}</span>
            <span className="text-sm font-semibold text-gray-900">
              {doneCount} / {totalDue} ολοκληρώθηκαν
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${
                progressPct === 100 ? "bg-green-500" : "bg-blue-500"
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1 text-right">{progressPct}%</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : dueRows.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            Δεν υπάρχουν προγραμματισμένες συντηρήσεις αυτόν τον μήνα
          </div>
        ) : (
          <div className="space-y-3">
            {dueRows.map(({ elevator, schedule, record }) => {
              const isDone = !!record?.done_at;
              const isSavingThis = saving === elevator.id;

              return (
                <div
                  key={elevator.id}
                  className={`bg-white rounded-xl border p-4 transition ${
                    isDone ? "border-green-200 bg-green-50/30" : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleDone(elevator.id, record)}
                      disabled={isSavingThis}
                      className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${
                        isDone
                          ? "bg-green-500 border-green-500 text-white"
                          : "border-gray-300 hover:border-blue-500"
                      }`}
                    >
                      {isDone && (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${isDone ? "text-gray-500 line-through" : "text-gray-900"}`}>
                        {elevator.address}
                      </p>
                      <p className="text-xs text-gray-500">{elevator.area}</p>
                      {isDone && record?.done_at && (
                        <p className="text-xs text-green-600 mt-0.5">
                          ✓ {new Date(record.done_at).toLocaleDateString("el-GR")}
                        </p>
                      )}
                    </div>

                    {/* Frequency selector */}
                    <select
                      value={schedule?.frequency_months ?? 1}
                      onChange={(e) => updateFrequency(elevator.id, Number(e.target.value))}
                      className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-600 flex-shrink-0"
                    >
                      {[1, 2, 3, 12].map((f) => (
                        <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Non-due elevators (collapsed) */}
        {rows.filter((r) => !r.isDue).length > 0 && (
          <details className="mt-6">
            <summary className="text-sm text-gray-500 cursor-pointer select-none hover:text-gray-700">
              Μη προγραμματισμένα αυτόν τον μήνα ({rows.filter((r) => !r.isDue).length})
            </summary>
            <div className="mt-3 space-y-2">
              {rows
                .filter((r) => !r.isDue)
                .map(({ elevator, schedule }) => (
                  <div key={elevator.id} className="bg-white rounded-xl border border-gray-100 p-4 opacity-60">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700">{elevator.address}</p>
                        <p className="text-xs text-gray-400">{elevator.area}</p>
                      </div>
                      <select
                        value={schedule?.frequency_months ?? 1}
                        onChange={(e) => updateFrequency(elevator.id, Number(e.target.value))}
                        className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-500"
                      >
                        {[1, 2, 3, 12].map((f) => (
                          <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
            </div>
          </details>
        )}
      </div>
    </AppLayout>
  );
}
