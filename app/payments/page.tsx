"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import AppLayout from "@/components/AppLayout";
import type { Elevator } from "@/lib/types";

interface Payment {
  id: string;
  elevator_id: string;
  month: number;
  year: number;
  invoice_date: string | null;
  invoice_number: string | null;
  payment_date: string | null;
  notes: string | null;
}

interface CellData {
  invoice_number: string;
  invoice_date: string;
  payment_date: string;
  notes: string;
}

const MONTHS = [
  "Ιαν", "Φεβ", "Μαρ", "Απρ", "Μαΐ", "Ιουν",
  "Ιουλ", "Αυγ", "Σεπ", "Οκτ", "Νοε", "Δεκ",
];

export default function PaymentsPage() {
  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [editingCell, setEditingCell] = useState<{ elevatorId: string; month: number } | null>(null);
  const [cellForm, setCellForm] = useState<CellData>({ invoice_number: "", invoice_date: "", payment_date: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const [elevatorsRes, paymentsRes] = await Promise.all([
      supabase.from("elevators").select("id, address, area, monthly_fee").order("address"),
      supabase.from("payments").select("*").eq("year", selectedYear),
    ]);

    if (elevatorsRes.data) setElevators(elevatorsRes.data as Elevator[]);
    if (paymentsRes.data) setPayments(paymentsRes.data as Payment[]);
    setLoading(false);
  }, [selectedYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getPayment = (elevatorId: string, month: number): Payment | undefined =>
    payments.find((p) => p.elevator_id === elevatorId && p.month === month);

  const openCell = (elevatorId: string, month: number) => {
    const existing = getPayment(elevatorId, month);
    setCellForm({
      invoice_number: existing?.invoice_number ?? "",
      invoice_date: existing?.invoice_date ?? "",
      payment_date: existing?.payment_date ?? "",
      notes: existing?.notes ?? "",
    });
    setEditingCell({ elevatorId, month });
  };

  const saveCell = async () => {
    if (!editingCell) return;
    setSaving(true);

    const existing = getPayment(editingCell.elevatorId, editingCell.month);
    const payload = {
      elevator_id: editingCell.elevatorId,
      month: editingCell.month,
      year: selectedYear,
      invoice_number: cellForm.invoice_number || null,
      invoice_date: cellForm.invoice_date || null,
      payment_date: cellForm.payment_date || null,
      notes: cellForm.notes || null,
    };

    if (existing) {
      await supabase.from("payments").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("payments").insert(payload);
    }

    setEditingCell(null);
    await fetchData();
    setSaving(false);
  };

  const deleteCell = async () => {
    if (!editingCell) return;
    const existing = getPayment(editingCell.elevatorId, editingCell.month);
    if (existing) {
      await supabase.from("payments").delete().eq("id", existing.id);
    }
    setEditingCell(null);
    await fetchData();
  };

  const now = new Date();
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  // Summary: paid = has payment_date, billed = has invoice_date but no payment_date
  const totalPaid = payments.filter((p) => p.payment_date).length;
  const totalBilled = payments.filter((p) => p.invoice_date && !p.payment_date).length;

  return (
    <AppLayout>
      <div className="max-w-full">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Πληρωμές</h1>
          <div className="flex items-center gap-3">
            {/* Summary badges */}
            <span className="text-xs px-2.5 py-1 bg-green-100 text-green-700 rounded-full font-medium">
              {totalPaid} πληρωμένα
            </span>
            <span className="text-xs px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full font-medium">
              {totalBilled} σε αναμονή
            </span>
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

        {/* Edit modal */}
        {editingCell && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">
                {elevators.find((e) => e.id === editingCell.elevatorId)?.address}
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                {MONTHS[editingCell.month - 1]} {selectedYear}
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Αρ. Τιμολογίου</label>
                  <input
                    type="text"
                    value={cellForm.invoice_number}
                    onChange={(e) => setCellForm({ ...cellForm, invoice_number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ημ. Τιμολογίου</label>
                  <input
                    type="date"
                    value={cellForm.invoice_date}
                    onChange={(e) => setCellForm({ ...cellForm, invoice_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ημ. Πληρωμής</label>
                  <input
                    type="date"
                    value={cellForm.payment_date}
                    onChange={(e) => setCellForm({ ...cellForm, payment_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Σημείωση</label>
                  <textarea
                    value={cellForm.notes}
                    onChange={(e) => setCellForm({ ...cellForm, notes: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Προαιρετική σημείωση..."
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 pt-4">
                <button
                  type="button"
                  onClick={deleteCell}
                  className="text-sm text-red-500 hover:text-red-700"
                >
                  Διαγραφή
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingCell(null)}
                    className="px-4 py-2 text-sm text-gray-600"
                  >
                    Ακύρωση
                  </button>
                  <button
                    type="button"
                    onClick={saveCell}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    {saving ? "Αποθήκευση..." : "Αποθήκευση"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3 sticky left-0 bg-gray-50 border-b border-gray-200 min-w-[180px]">
                    Ασανσέρ
                  </th>
                  {MONTHS.map((m, i) => (
                    <th key={i} className="px-2 py-3 text-center border-b border-gray-200 min-w-[70px]">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {elevators.map((elevator) => (
                  <tr key={elevator.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 sticky left-0 bg-white border-r border-gray-100">
                      <p className="text-sm font-medium text-gray-900 truncate max-w-[160px]">{elevator.address}</p>
                      <p className="text-xs text-gray-400">€{elevator.monthly_fee}/μήνα</p>
                    </td>
                    {MONTHS.map((_, i) => {
                      const month = i + 1;
                      const payment = getPayment(elevator.id, month);
                      const isPaid = !!payment?.payment_date;
                      const isBilled = !!payment?.invoice_date && !isPaid;
                      const isFuture = new Date(selectedYear, month - 1, 1) > now && !payment;

                      return (
                        <td key={month} className="px-1 py-2 text-center">
                          <button
                            onClick={() => openCell(elevator.id, month)}
                            className={`w-full h-10 rounded-lg text-xs font-medium transition border ${
                              isPaid
                                ? "bg-green-100 border-green-200 text-green-700 hover:bg-green-200"
                                : isBilled
                                ? "bg-amber-100 border-amber-200 text-amber-700 hover:bg-amber-200"
                                : isFuture
                                ? "bg-gray-50 border-gray-100 text-gray-300 hover:bg-gray-100"
                                : "bg-red-50 border-red-100 text-red-400 hover:bg-red-100"
                            }`}
                          >
                            {isPaid ? (
                              <span>✓</span>
                            ) : isBilled ? (
                              <span>●</span>
                            ) : (
                              <span className="text-[10px]">—</span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-green-100 border border-green-200 inline-block" />
            Πληρώθηκε
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-100 border border-amber-200 inline-block" />
            Τιμολόγιο (χωρίς πληρωμή)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-red-50 border border-red-100 inline-block" />
            Εκκρεμεί
          </span>
        </div>
      </div>
    </AppLayout>
  );
}
