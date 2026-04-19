"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import AppLayout from "@/components/AppLayout";
import type { Elevator } from "@/lib/types";
import Link from "next/link";

const statusLabels: Record<string, { label: string; color: string }> = {
  active: { label: "Ενεργό", color: "bg-green-100 text-green-700" },
  inactive: { label: "Ανενεργό", color: "bg-gray-100 text-gray-600" },
  maintenance: { label: "Συντήρηση", color: "bg-amber-100 text-amber-700" },
};

export default function ElevatorsPage() {
  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Elevator | null>(null);
  const [form, setForm] = useState(getEmptyForm());
  const [saving, setSaving] = useState(false);

  function getEmptyForm() {
    return {
      address: "",
      area: "",
      contact_name: "",
      contact_phone: "",
      contact_email: "",
      monthly_fee: "",
      certification_date: "",
      certification_expiry: "",
      floors: "1",
      notes: "",
      status: "active" as "active" | "inactive" | "maintenance",
    };
  }

  const fetchElevators = useCallback(async () => {
    const { data } = await supabase
      .from("elevators")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setElevators(data as Elevator[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchElevators();
  }, [fetchElevators]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload = {
      address: form.address,
      area: form.area,
      contact_name: form.contact_name,
      contact_phone: form.contact_phone,
      contact_email: form.contact_email || null,
      monthly_fee: parseFloat(form.monthly_fee) || 0,
      certification_date: form.certification_date || null,
      certification_expiry: form.certification_expiry || null,
      floors: parseInt(form.floors) || 1,
      notes: form.notes || null,
      status: form.status,
    };

    if (editing) {
      await supabase.from("elevators").update(payload).eq("id", editing.id);
    } else {
      await supabase.from("elevators").insert(payload);
    }

    setShowForm(false);
    setEditing(null);
    setForm(getEmptyForm());
    setSaving(false);
    fetchElevators();
  };

  const openEdit = (elevator: Elevator) => {
    setEditing(elevator);
    setForm({
      address: elevator.address,
      area: elevator.area,
      contact_name: elevator.contact_name,
      contact_phone: elevator.contact_phone,
      contact_email: elevator.contact_email || "",
      monthly_fee: elevator.monthly_fee.toString(),
      certification_date: elevator.certification_date || "",
      certification_expiry: elevator.certification_expiry || "",
      floors: elevator.floors.toString(),
      notes: elevator.notes || "",
      status: elevator.status,
    });
    setShowForm(true);
  };

  const filtered = elevators.filter(
    (e) =>
      e.address.toLowerCase().includes(search.toLowerCase()) ||
      e.contact_name.toLowerCase().includes(search.toLowerCase()) ||
      e.area.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Ασανσέρ</h1>
          <button
            onClick={() => {
              setEditing(null);
              setForm(getEmptyForm());
              setShowForm(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
          >
            + Νέο Ασανσέρ
          </button>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Αναζήτηση (διεύθυνση, επαφή, περιοχή)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                {editing ? "Επεξεργασία Ασανσέρ" : "Νέο Ασανσέρ"}
              </h2>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Διεύθυνση *" value={form.address} onChange={(v) => setForm({ ...form, address: v })} required />
                  <FormField label="Περιοχή" value={form.area} onChange={(v) => setForm({ ...form, area: v })} />
                  <FormField label="Όνομα Επικοινωνίας *" value={form.contact_name} onChange={(v) => setForm({ ...form, contact_name: v })} required />
                  <FormField label="Τηλέφωνο *" value={form.contact_phone} onChange={(v) => setForm({ ...form, contact_phone: v })} required />
                  <FormField label="Email Επικοινωνίας" type="email" value={form.contact_email} onChange={(v) => setForm({ ...form, contact_email: v })} />
                  <FormField label="Μηνιαίο Κόστος (€)" type="number" value={form.monthly_fee} onChange={(v) => setForm({ ...form, monthly_fee: v })} />
                  <FormField label="Ημ. Πιστοποίησης" type="date" value={form.certification_date} onChange={(v) => setForm({ ...form, certification_date: v })} />
                  <FormField label="Λήξη Πιστοποίησης" type="date" value={form.certification_expiry} onChange={(v) => setForm({ ...form, certification_expiry: v })} />
                  <FormField label="Όροφοι" type="number" value={form.floors} onChange={(v) => setForm({ ...form, floors: v })} />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Κατάσταση</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "inactive" | "maintenance" })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="active">Ενεργό</option>
                      <option value="inactive">Ανενεργό</option>
                      <option value="maintenance">Συντήρηση</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Σημειώσεις</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
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

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-500">Δεν βρέθηκαν ασανσέρ</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Διεύθυνση</th>
                  <th className="px-6 py-3">Επαφή</th>
                  <th className="px-6 py-3">Τηλέφωνο</th>
                  <th className="px-6 py-3">€/μήνα</th>
                  <th className="px-6 py-3">Πιστοποίηση</th>
                  <th className="px-6 py-3">Κατάσταση</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((elevator) => {
                  const st = statusLabels[elevator.status];
                  const certExpiry = elevator.certification_expiry
                    ? new Date(elevator.certification_expiry)
                    : null;
                  const isExpiringSoon =
                    certExpiry && certExpiry.getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000 && certExpiry.getTime() > Date.now();
                  const isExpired = certExpiry && certExpiry.getTime() < Date.now();

                  return (
                    <tr key={elevator.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <Link href={`/elevators/${elevator.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                          {elevator.address}
                        </Link>
                        <p className="text-xs text-gray-500">{elevator.area}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{elevator.contact_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{elevator.contact_phone}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">€{elevator.monthly_fee}</td>
                      <td className="px-6 py-4">
                        {certExpiry ? (
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              isExpired
                                ? "bg-red-100 text-red-700"
                                : isExpiringSoon
                                ? "bg-amber-100 text-amber-700"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            {certExpiry.toLocaleDateString("el-GR")}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.color}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => openEdit(elevator)}
                          className="text-sm text-gray-500 hover:text-blue-600"
                        >
                          Επεξεργασία
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
      />
    </div>
  );
}
