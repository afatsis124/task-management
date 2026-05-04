"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import AppLayout from "@/components/AppLayout";
import type { Elevator } from "@/lib/types";

interface MaintenanceSchedule {
  id: string;
  elevator_id: string;
  frequency_months: 1 | 2 | 3 | 12;
  group_name: string | null;
}

interface MaintenanceRecord {
  id: string;
  elevator_id: string;
  month: number;
  year: number;
  done_at: string | null;
  needs_payment: boolean;
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
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const notesRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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

  const getOrCreateRecord = async (elevatorId: string): Promise<MaintenanceRecord> => {
    const existing = records.find((r) => r.elevator_id === elevatorId);
    if (existing) return existing;
    const { data } = await supabase
      .from("maintenance_records")
      .insert({ elevator_id: elevatorId, month: selectedMonth, year: selectedYear, needs_payment: false })
      .select()
      .single();
    return data as MaintenanceRecord;
  };

  const updateFrequency = async (elevatorId: string, frequency: number) => {
    const existing = schedules.find((s) => s.elevator_id === elevatorId);
    if (existing) {
      await supabase.from("maintenance_schedules").update({ frequency_months: frequency }).eq("id", existing.id);
    } else {
      await supabase.from("maintenance_schedules").insert({ elevator_id: elevatorId, frequency_months: frequency });
    }
    fetchData();
  };

  const updateGroup = async (elevatorId: string, groupName: string) => {
    const existing = schedules.find((s) => s.elevator_id === elevatorId);
    const val = groupName.trim() || null;
    if (existing) {
      await supabase.from("maintenance_schedules").update({ group_name: val }).eq("id", existing.id);
    } else {
      await supabase.from("maintenance_schedules").insert({ elevator_id: elevatorId, frequency_months: 1, group_name: val });
    }
    fetchData();
  };

  const toggleDone = async (elevatorId: string, currentRecord: MaintenanceRecord | null) => {
    setSaving(elevatorId);
    if (currentRecord) {
      await supabase
        .from("maintenance_records")
        .update({ done_at: currentRecord.done_at ? null : new Date().toISOString().split("T")[0] })
        .eq("id", currentRecord.id);
    } else {
      await supabase.from("maintenance_records").insert({
        elevator_id: elevatorId,
        month: selectedMonth,
        year: selectedYear,
        done_at: new Date().toISOString().split("T")[0],
        needs_payment: false,
      });
    }
    await fetchData();
    setSaving(null);
  };

  const toggleNeedsPayment = async (elevatorId: string, currentRecord: MaintenanceRecord | null) => {
    setSaving(elevatorId + "_pay");
    let rec = currentRecord;
    if (!rec) rec = await getOrCreateRecord(elevatorId);
    await supabase
      .from("maintenance_records")
      .update({ needs_payment: !rec.needs_payment })
      .eq("id", rec.id);
    await fetchData();
    setSaving(null);
  };

  const saveNotes = async (elevatorId: string, notes: string, currentRecord: MaintenanceRecord | null) => {
    let rec = currentRecord;
    if (!rec) rec = await getOrCreateRecord(elevatorId);
    await supabase.from("maintenance_records").update({ notes: notes || null }).eq("id", rec.id);
    await fetchData();
  };

  const handleNotesChange = (elevatorId: string, value: string, record: MaintenanceRecord | null) => {
    setRecords((prev) =>
      prev.map((r) => (r.elevator_id === elevatorId ? { ...r, notes: value } : r))
    );
    if (notesRefs.current[elevatorId]) clearTimeout(notesRefs.current[elevatorId]);
    notesRefs.current[elevatorId] = setTimeout(() => saveNotes(elevatorId, value, record), 800);
  };

  const toggleNotesExpanded = (elevatorId: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(elevatorId)) next.delete(elevatorId);
      else next.add(elevatorId);
      return next;
    });
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

  // Group due rows by group_name
  const groupedDue = dueRows.reduce<Record<string, ElevatorRow[]>>((acc, row) => {
    const key = row.schedule?.group_name || "—";
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  const groupKeys = Object.keys(groupedDue).sort((a, b) =>
    a === "—" ? 1 : b === "—" ? -1 : a.localeCompare(b)
  );

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Συντηρήσεις</h1>
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
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
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
              className={`h-3 rounded-full transition-all duration-500 ${progressPct === 100 ? "bg-green-500" : "bg-blue-500"}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1 text-right">{progressPct}%</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : totalDue === 0 ? (
          <div className="text-center py-20 text-gray-500">
            Δεν υπάρχουν προγραμματισμένες συντηρήσεις αυτόν τον μήνα
          </div>
        ) : (
          <div className="space-y-6">
            {groupKeys.map((groupKey) => {
              const groupRows = groupedDue[groupKey];
              const groupDone = groupRows.filter((r) => r.record?.done_at).length;
              return (
                <div key={groupKey}>
                  {/* Group header */}
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {groupKey === "—" ? "Χωρίς μερίδα" : `Μερίδα: ${groupKey}`}
                    </h3>
                    <span className="text-xs text-gray-400">{groupDone}/{groupRows.length}</span>
                  </div>

                  <div className="space-y-2">
                    {groupRows.map(({ elevator, schedule, record }) => {
                      const isDone = !!record?.done_at;
                      const needsPayment = !!record?.needs_payment;
                      const isSavingCheck = saving === elevator.id;
                      const isSavingPay = saving === elevator.id + "_pay";
                      const notesOpen = expandedNotes.has(elevator.id);
                      const notesValue = record?.notes ?? "";

                      return (
                        <div
                          key={elevator.id}
                          className={`bg-white rounded-xl border p-3 transition ${
                            needsPayment
                              ? "border-amber-300 bg-amber-50/40"
                              : isDone
                              ? "border-green-200 bg-green-50/20"
                              : "border-gray-200"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {/* Done checkbox */}
                            <button
                              onClick={() => toggleDone(elevator.id, record)}
                              disabled={isSavingCheck}
                              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${
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
                              <p className={`text-sm font-medium ${isDone ? "text-gray-400 line-through" : "text-gray-900"}`}>
                                {elevator.address}
                              </p>
                              <p className="text-xs text-gray-400">{elevator.area}</p>
                              {isDone && record?.done_at && (
                                <p className="text-xs text-green-600 mt-0.5">
                                  ✓ {new Date(record.done_at).toLocaleDateString("el-GR")}
                                </p>
                              )}
                            </div>

                            {/* Notes toggle */}
                            <button
                              onClick={() => toggleNotesExpanded(elevator.id)}
                              title="Σημειώσεις"
                              className={`p-1.5 rounded-lg transition flex-shrink-0 ${
                                notesValue
                                  ? "text-blue-500 bg-blue-50"
                                  : notesOpen
                                  ? "text-gray-600 bg-gray-100"
                                  : "text-gray-300 hover:text-gray-500 hover:bg-gray-100"
                              }`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>

                            {/* Needs payment toggle */}
                            <button
                              onClick={() => toggleNeedsPayment(elevator.id, record)}
                              disabled={isSavingPay}
                              title="Πληρωτέο από διαχειριστή"
                              className={`p-1.5 rounded-lg transition flex-shrink-0 ${
                                needsPayment
                                  ? "text-amber-600 bg-amber-100"
                                  : "text-gray-300 hover:text-amber-500 hover:bg-amber-50"
                              }`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>

                            {/* Group input */}
                            <input
                              type="text"
                              defaultValue={schedule?.group_name ?? ""}
                              onBlur={(e) => updateGroup(elevator.id, e.target.value)}
                              placeholder="Μερίδα"
                              className="text-xs w-20 px-2 py-1.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-600 flex-shrink-0"
                            />

                            {/* Frequency */}
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

                          {/* Notes textarea */}
                          {notesOpen && (
                            <div className="mt-3 pl-9">
                              <textarea
                                value={notesValue}
                                onChange={(e) => handleNotesChange(elevator.id, e.target.value, record)}
                                rows={2}
                                placeholder="Σημειώσεις (επισκευές, πληρωμές διαχειριστή, κτλ.)"
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Non-due elevators */}
        {rows.filter((r) => !r.isDue).length > 0 && (
          <details className="mt-6">
            <summary className="text-sm text-gray-500 cursor-pointer select-none hover:text-gray-700">
              Μη προγραμματισμένα αυτόν τον μήνα ({rows.filter((r) => !r.isDue).length})
            </summary>
            <div className="mt-3 space-y-2">
              {rows.filter((r) => !r.isDue).map(({ elevator, schedule }) => (
                <div key={elevator.id} className="bg-white rounded-xl border border-gray-100 p-3 opacity-60">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700">{elevator.address}</p>
                      <p className="text-xs text-gray-400">{elevator.area}</p>
                    </div>
                    <input
                      type="text"
                      defaultValue={schedule?.group_name ?? ""}
                      onBlur={(e) => updateGroup(elevator.id, e.target.value)}
                      placeholder="Μερίδα"
                      className="text-xs w-20 px-2 py-1.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-500"
                    />
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
