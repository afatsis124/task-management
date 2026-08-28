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
  // Set when the money was actually collected; null means still outstanding.
  payment_collected_at: string | null;
  notes: string | null;
  // Separate note shown only while this month's visit is flagged πληρωτέο.
  payment_notes: string | null;
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
  // Last month's records, used to carry notes forward.
  const [prevRecords, setPrevRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  // What the user is currently typing, keyed by elevator+month, so the
  // textareas stay responsive while the debounced save is in flight.
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [paymentNoteDrafts, setPaymentNoteDrafts] = useState<Record<string, string>>({});
  const notesRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const paymentNotesRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
  const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
  const fetchData = useCallback(async () => {
    const [elevatorsRes, schedulesRes, recordsRes, prevRecordsRes] = await Promise.all([
      supabase.from("elevators").select("*").eq("status", "active").order("address"),
      supabase.from("maintenance_schedules").select("*"),
      supabase
        .from("maintenance_records")
        .select("*")
        .eq("month", selectedMonth)
        .eq("year", selectedYear),
      supabase
        .from("maintenance_records")
        .select("*")
        .eq("month", prevMonth)
        .eq("year", prevYear),
    ]);
    if (elevatorsRes.data) setElevators(elevatorsRes.data as Elevator[]);
    if (schedulesRes.data) setSchedules(schedulesRes.data as MaintenanceSchedule[]);
    if (recordsRes.data) setRecords(recordsRes.data as MaintenanceRecord[]);
    setPrevRecords((prevRecordsRes.data as MaintenanceRecord[]) ?? []);
    setLoading(false);
  }, [selectedMonth, selectedYear, prevMonth, prevYear]);
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  // Clear any in-progress typing when the month changes, so drafts never leak
  // from one month into another.
  useEffect(() => {
    setNoteDrafts({});
    setPaymentNoteDrafts({});
  }, [selectedMonth, selectedYear]);
  // Last month's note for this elevator, or null. This is what gets carried
  // forward into a newly created record.
  const previousNoteFor = (elevatorId: string): string | null => {
    const prev = prevRecords.find((r) => r.elevator_id === elevatorId);
    const note = prev?.notes?.trim();
    return note ? note : null;
  };
  const getOrCreateRecord = async (elevatorId: string): Promise<MaintenanceRecord> => {
    const existing = records.find((r) => r.elevator_id === elevatorId);
    if (existing) return existing;
    const { data } = await supabase
      .from("maintenance_records")
      .insert({
        elevator_id: elevatorId,
        month: selectedMonth,
        year: selectedYear,
        needs_payment: false,
        notes: previousNoteFor(elevatorId),
      })
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
        notes: previousNoteFor(elevatorId),
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
  // Confirms the money was actually collected during the visit (or clears it again).
  const togglePaymentCollected = async (elevatorId: string, currentRecord: MaintenanceRecord | null) => {
    setSaving(elevatorId + "_collected");
    let rec = currentRecord;
    if (!rec) rec = await getOrCreateRecord(elevatorId);
    await supabase
      .from("maintenance_records")
      .update({ payment_collected_at: rec.payment_collected_at ? null : new Date().toISOString() })
      .eq("id", rec.id);
    await fetchData();
    setSaving(null);
  };
  const saveNotes = async (elevatorId: string, notes: string, currentRecord: MaintenanceRecord | null) => {
    let rec = currentRecord;
    if (!rec) rec = await getOrCreateRecord(elevatorId);
    // Stored as "" (not null) when cleared, so an empty note is remembered as a
    // deliberate choice and last month's note is not pulled back in.
    await supabase.from("maintenance_records").update({ notes }).eq("id", rec.id);
    await fetchData();
  };
  const savePaymentNotes = async (elevatorId: string, notes: string, currentRecord: MaintenanceRecord | null) => {
    let rec = currentRecord;
    if (!rec) rec = await getOrCreateRecord(elevatorId);
    await supabase.from("maintenance_records").update({ payment_notes: notes || null }).eq("id", rec.id);
    await fetchData();
  };
  const handleNotesChange = (
    elevatorId: string,
    draftKey: string,
    value: string,
    record: MaintenanceRecord | null
  ) => {
    setNoteDrafts((prev) => ({ ...prev, [draftKey]: value }));
    if (notesRefs.current[draftKey]) clearTimeout(notesRefs.current[draftKey]);
    notesRefs.current[draftKey] = setTimeout(() => saveNotes(elevatorId, value, record), 800);
  };
  const handlePaymentNotesChange = (
    elevatorId: string,
    draftKey: string,
    value: string,
    record: MaintenanceRecord | null
  ) => {
    setPaymentNoteDrafts((prev) => ({ ...prev, [draftKey]: value }));
    if (paymentNotesRefs.current[draftKey]) clearTimeout(paymentNotesRefs.current[draftKey]);
    paymentNotesRefs.current[draftKey] = setTimeout(
      () => savePaymentNotes(elevatorId, value, record),
      800
    );
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
  // How many of this month's payable visits have actually been collected.
  const payableRows = dueRows.filter((r) => r.record?.needs_payment);
  const collectedCount = payableRows.filter((r) => r.record?.payment_collected_at).length;
  const outstandingCount = payableRows.length - collectedCount;
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
    a === "—" ? 1 : b === "—" ? -1 : a.localeCompare(b, undefined, { numeric: true })
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
          {/* Collection summary */}
          {payableRows.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
              <span className="text-gray-500">Εισπράξεις</span>
              <span className="font-medium">
                <span className="text-green-600">{collectedCount} εισπράχθηκαν</span>
                {outstandingCount > 0 && (
                  <span className="text-amber-600"> · {outstandingCount} εκκρεμούν</span>
                )}
              </span>
            </div>
          )}
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
                      const paymentCollected = !!record?.payment_collected_at;
                      const isSavingCheck = saving === elevator.id;
                      const isSavingPay = saving === elevator.id + "_pay";
                      const isSavingCollected = saving === elevator.id + "_collected";
                      const notesOpen = expandedNotes.has(elevator.id);
                      const draftKey = `${elevator.id}_${selectedMonth}_${selectedYear}`;
                      // A record can exist for other reasons (done, πληρωτέο) and still
                      // have no note. Carry last month's note forward whenever this
                      // month has no note of its own. An empty string means the note
                      // was deliberately cleared here, so nothing is inherited.
                      const ownNote = record?.notes;
                      const hasOwnNote = ownNote !== null && ownNote !== undefined;
                      const inheritedNote = hasOwnNote ? null : previousNoteFor(elevator.id);
                      const notesValue =
                        noteDrafts[draftKey] ?? (hasOwnNote ? ownNote : inheritedNote ?? "");
                      const showsInherited =
                        noteDrafts[draftKey] === undefined && !hasOwnNote && !!inheritedNote;
                      const paymentNotesValue =
                        paymentNoteDrafts[draftKey] ?? record?.payment_notes ?? "";
                      return (
                        <div
                          key={elevator.id}
                          className={`bg-white rounded-xl border p-3 transition ${
                            needsPayment && !paymentCollected
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
                              {paymentCollected && record?.payment_collected_at && (
                                <p className="text-xs text-green-700 mt-0.5">
                                  € Εισπράχθηκε {new Date(record.payment_collected_at).toLocaleDateString("el-GR")}
                                </p>
                              )}
                              {needsPayment && !paymentCollected && (
                                <p className="text-xs text-amber-700 mt-0.5">€ Εκκρεμεί είσπραξη</p>
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
                            {/* Payment collected confirmation */}
                            <button
                              onClick={() => togglePaymentCollected(elevator.id, record)}
                              disabled={isSavingCollected}
                              title={paymentCollected ? "Εισπράχθηκε — κλικ για αναίρεση" : "Επιβεβαίωση είσπραξης"}
                              className={`p-1.5 rounded-lg transition flex-shrink-0 ${
                                paymentCollected
                                  ? "text-green-700 bg-green-100"
                                  : "text-gray-300 hover:text-green-600 hover:bg-green-50"
                              }`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
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
                          {/* Payment notes — only while this visit is flagged πληρωτέο */}
                          {needsPayment && (
                            <div className="mt-3 pl-9">
                              <label className="block text-xs font-medium text-amber-800 mb-1">
                                Σημειώσεις πληρωμής
                              </label>
                              <textarea
                                value={paymentNotesValue}
                                onChange={(e) =>
                                  handlePaymentNotesChange(elevator.id, draftKey, e.target.value, record)
                                }
                                rows={2}
                                placeholder="π.χ. δεν ήταν ο διαχειριστής, θα πληρώσει τον επόμενο μήνα"
                                className="w-full px-3 py-2 text-sm bg-amber-50/60 border border-amber-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                              />
                            </div>
                          )}
                          {/* Notes textarea */}
                          {notesOpen && (
                            <div className="mt-3 pl-9">
                              {showsInherited && (
                                <p className="text-xs text-gray-400 mb-1">
                                  Μεταφέρθηκε από τον προηγούμενο μήνα
                                </p>
                              )}
                              <textarea
                                value={notesValue}
                                onChange={(e) =>
                                  handleNotesChange(elevator.id, draftKey, e.target.value, record)
                                }
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
