"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import AppLayout from "@/components/AppLayout";
import SearchableSelect from "@/components/SearchableSelect";
import { toStorageKey } from "@/lib/files";
import type { Elevator, UserProfile } from "@/lib/types";

type Category = "parts" | "fuel" | "salaries" | "taxes" | "bills" | "other";

interface Expense {
  id: string;
  date: string;
  category: Category;
  amount: number;
  vat: number;
  description: string | null;
  supplier: string | null;
  person: string | null;
  elevator_id: string | null;
  document_number: string | null;
  debit_number: string | null;
  document_type: "sale_confirmation" | "cash_register" | null;
  receipt_date: string | null;
  payment_date: string | null;
  period_start: string | null;
  period_end: string | null;
  cash_received: number | null;
  pdf_url: string | null;
  created_at: string;
}

const CATEGORIES: { key: Category; label: string; color: string }[] = [
  { key: "parts", label: "Ανταλλακτικά", color: "bg-purple-100 text-purple-700" },
  { key: "fuel", label: "Καύσιμα / Οχήματα", color: "bg-blue-100 text-blue-700" },
  { key: "salaries", label: "Μισθοί", color: "bg-green-100 text-green-700" },
  { key: "taxes", label: "Φόροι / Εισφορές", color: "bg-red-100 text-red-700" },
  { key: "bills", label: "Λογαριασμοί", color: "bg-amber-100 text-amber-700" },
  { key: "other", label: "Άλλα", color: "bg-gray-100 text-gray-600" },
];

const CATEGORY_LABEL: Record<Category, string> = CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.key]: c.label }),
  {} as Record<Category, string>
);
const CATEGORY_COLOR: Record<Category, string> = CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.key]: c.color }),
  {} as Record<Category, string>
);

/** Categories that repeat month after month and are worth copying forward. */
const RECURRING: Category[] = ["fuel", "salaries", "taxes", "bills", "other"];

const VAT_RATES = [24, 13, 6, 0];

function money(n: number): string {
  return n.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function emptyForm() {
  return {
    date: new Date().toISOString().split("T")[0],
    category: "bills" as Category,
    gross: "",
    vatRate: "24",
    description: "",
    supplier: "",
    person: "",
    elevator_id: "",
    document_number: "",
    debit_number: "",
    document_type: "" as "" | "sale_confirmation" | "cash_register",
    receipt_date: "",
    payment_date: "",
    period_start: "",
    period_end: "",
    cash_received: "",
    pdf_url: "",
  };
}

export default function ExpensesPage() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [people, setPeople] = useState<UserProfile[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
  const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;

  // First and last day of the selected month, as plain YYYY-MM-DD.
  const monthRange = (m: number, y: number) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const last = new Date(y, m, 0).getDate();
    return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
  };

  const fetchData = useCallback(async () => {
    const { from, to } = monthRange(selectedMonth, selectedYear);
    const { data: auth } = await supabase.auth.getUser();
    const [expensesRes, elevatorsRes, peopleRes] = await Promise.all([
      supabase.from("expenses").select("*").gte("date", from).lte("date", to).order("date", { ascending: false }),
      supabase.from("elevators").select("*").order("address"),
      supabase.from("profiles").select("*").order("full_name"),
    ]);
    if (expensesRes.data) setExpenses(expensesRes.data as Expense[]);
    if (elevatorsRes.data) setElevators(elevatorsRes.data as Elevator[]);
    if (peopleRes.data) setPeople(peopleRes.data as UserProfile[]);
    // Only used to decide what this page shows — the database enforces the
    // real restriction through row level security.
    if (auth.user) {
      const me = (peopleRes.data as UserProfile[] | null)?.find((p) => p.id === auth.user!.id);
      setRole(me?.role ?? null);
    } else {
      setRole(null);
    }
    setLoading(false);
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Opened via "→ Έξοδο" on an elevator's spare part: the form arrives
  // pre-filled so only the purchase cost and invoice need typing.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("new_part") !== "1") return;
    const date = q.get("date") || new Date().toISOString().split("T")[0];
    const d = new Date(date);
    if (!isNaN(d.getTime())) {
      setSelectedMonth(d.getMonth() + 1);
      setSelectedYear(d.getFullYear());
    }
    setEditing(null);
    setForm({
      ...emptyForm(),
      category: "parts",
      date,
      description: q.get("desc") || "",
      elevator_id: q.get("elevator") || "",
    });
    setShowForm(true);
    window.history.replaceState({}, "", "/expenses");
  }, []);

  const elevatorOptions = useMemo(
    () => elevators.map((e) => ({ value: e.id, label: `${e.address} (${e.area})` })),
    [elevators]
  );

  const visible = filterCategory === "all" ? expenses : expenses.filter((e) => e.category === filterCategory);

  const totals = useMemo(() => {
    const perCategory: Record<string, number> = {};
    let net = 0;
    let vat = 0;
    for (const e of expenses) {
      const gross = Number(e.amount) + Number(e.vat || 0);
      perCategory[e.category] = (perCategory[e.category] || 0) + gross;
      net += Number(e.amount);
      vat += Number(e.vat || 0);
    }
    return { perCategory, net, vat, gross: net + vat };
  }, [expenses]);

  const openNew = () => {
    setEditing(null);
    const f = emptyForm();
    // Default the date into the month being viewed, not necessarily today.
    const pad = (n: number) => String(n).padStart(2, "0");
    const isThisMonth = selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear();
    f.date = isThisMonth ? f.date : `${selectedYear}-${pad(selectedMonth)}-01`;
    setForm(f);
    setShowForm(true);
  };

  const openEdit = (e: Expense) => {
    setEditing(e);
    setForm({
      date: e.date,
      category: e.category,
      gross: String(Number(e.amount ?? 0) + Number(e.vat ?? 0)),
      vatRate:
        Number(e.amount) > 0
          ? String(Math.round((Number(e.vat) / Number(e.amount)) * 10000) / 100)
          : "24",
      description: e.description ?? "",
      supplier: e.supplier ?? "",
      person: e.person ?? "",
      elevator_id: e.elevator_id ?? "",
      document_number: e.document_number ?? "",
      debit_number: e.debit_number ?? "",
      document_type: e.document_type ?? "",
      receipt_date: e.receipt_date ?? "",
      payment_date: e.payment_date ?? "",
      period_start: e.period_start ?? "",
      period_end: e.period_end ?? "",
      cash_received: e.cash_received != null ? String(e.cash_received) : "",
      pdf_url: e.pdf_url ?? "",
    });
    setShowForm(true);
  };

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    // The receipt shows the total; net and ΦΠΑ are derived from it so the two
    // always add back up to exactly what was paid.
    const gross = parseFloat(form.gross) || 0;
    const rate = parseFloat(form.vatRate) || 0;
    const net = Math.round((gross / (1 + rate / 100)) * 100) / 100;
    const vatAmount = Math.round((gross - net) * 100) / 100;
    const payload = {
      date: form.date,
      category: form.category,
      amount: net,
      vat: vatAmount,
      description: form.description || null,
      supplier: form.supplier || null,
      person: form.person || null,
      elevator_id: form.elevator_id || null,
      document_number: form.document_number || null,
      debit_number: form.debit_number || null,
      document_type: form.document_type || null,
      receipt_date: form.receipt_date || null,
      payment_date: form.payment_date || null,
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      cash_received: form.cash_received ? parseFloat(form.cash_received) : null,
      pdf_url: form.pdf_url || null,
    };
    if (editing) {
      await supabase
        .from("expenses")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", editing.id);
    } else {
      await supabase.from("expenses").insert({ ...payload, created_by: auth.user?.id ?? null });
    }
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
    setSaving(false);
    fetchData();
  };

  /** Stores the invoice PDF and hangs its address on the form. */
  const handlePdfUpload = async (file: File) => {
    setUploadingPdf(true);
    const path = `expenses/${Date.now()}_${toStorageKey(file.name)}`;
    const { error } = await supabase.storage.from("repair-pdfs").upload(path, file);
    setUploadingPdf(false);
    if (error) {
      alert("Σφάλμα upload: " + error.message);
      return;
    }
    const { data } = supabase.storage.from("repair-pdfs").getPublicUrl(path);
    setForm((f) => ({ ...f, pdf_url: data.publicUrl }));
  };

  const deleteExpense = async (id: string) => {
    if (!confirm("Διαγραφή εξόδου;")) return;
    await supabase.from("expenses").delete().eq("id", id);
    fetchData();
  };

  /** Copies last month's recurring expenses into the month being viewed. */
  const copyLastMonth = async () => {
    const { from, to } = monthRange(prevMonth, prevYear);
    const { data } = await supabase
      .from("expenses")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .in("category", RECURRING);
    const rows = (data as Expense[]) ?? [];
    if (rows.length === 0) {
      alert("Δεν βρέθηκαν επαναλαμβανόμενα έξοδα τον προηγούμενο μήνα.");
      return;
    }
    const monthLabel = new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString("el-GR", {
      month: "long",
      year: "numeric",
    });
    if (!confirm(`Αντιγραφή ${rows.length} εξόδων στον ${monthLabel}; Τα ποσά μπορούν να διορθωθούν μετά.`)) return;
    setCopying(true);
    const { data: auth } = await supabase.auth.getUser();
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const pad = (n: number) => String(n).padStart(2, "0");
    const copies = rows.map((r) => {
      const day = Math.min(Number(r.date.split("-")[2]), daysInMonth);
      return {
        date: `${selectedYear}-${pad(selectedMonth)}-${pad(day)}`,
        category: r.category,
        amount: r.amount,
        vat: r.vat,
        description: r.description,
        supplier: r.supplier,
        person: r.person,
        elevator_id: r.elevator_id,
        document_number: null,
        created_by: auth.user?.id ?? null,
      };
    });
    await supabase.from("expenses").insert(copies);
    setCopying(false);
    fetchData();
  };

  const formGross = parseFloat(form.gross) || 0;
  const formRate = parseFloat(form.vatRate) || 0;
  const formNet = Math.round((formGross / (1 + formRate / 100)) * 100) / 100;
  const formVat = Math.round((formGross - formNet) * 100) / 100;

  const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const monthName = new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString("el-GR", {
    month: "long",
    year: "numeric",
  });

  const allowed = role === "admin" || role === "office";

  if (!loading && !allowed) {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto text-center py-24">
          <p className="text-gray-900 font-medium">Δεν έχετε πρόσβαση σε αυτή τη σελίδα</p>
          <p className="text-sm text-gray-500 mt-2">
            Τα οικονομικά στοιχεία είναι διαθέσιμα μόνο σε διαχειριστές και στο γραφείο.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Έξοδα</h1>
          <div className="flex items-center gap-2 flex-wrap">
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
            <button
              onClick={openNew}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
            >
              + Νέο Έξοδο
            </button>
          </div>
        </div>

        {/* Month summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm text-gray-500 capitalize">{monthName}</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">€{money(totals.gross)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Καθαρή αξία €{money(totals.net)} · ΦΠΑ €{money(totals.vat)}
              </p>
            </div>
            <button
              onClick={copyLastMonth}
              disabled={copying}
              className="px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition"
            >
              {copying ? "Αντιγραφή..." : "Αντιγραφή προηγούμενου μήνα"}
            </button>
          </div>
          {expenses.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-x-5 gap-y-2">
              {CATEGORIES.filter((c) => totals.perCategory[c.key]).map((c) => (
                <div key={c.key} className="text-xs">
                  <span className="text-gray-500">{c.label}</span>{" "}
                  <span className="font-semibold text-gray-900">€{money(totals.perCategory[c.key])}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setFilterCategory("all")}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition ${
              filterCategory === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Όλα
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setFilterCategory(c.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition ${
                filterCategory === c.key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Form */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                {editing ? "Επεξεργασία Εξόδου" : "Νέο Έξοδο"}
              </h2>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Κατηγορία *</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setForm({ ...form, category: c.key })}
                        className={`px-2 py-2 text-xs font-medium rounded-lg border transition ${
                          form.category === c.key
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "border-gray-300 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ημερομηνία *</label>
                    <input
                      type="date"
                      required
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {form.category === "parts" ? "Αρ. Ταμειακής / Τιμολογίου" : "Παραστατικό"}
                    </label>
                    <input
                      type="text"
                      value={form.document_number}
                      onChange={(e) => setForm({ ...form, document_number: e.target.value })}
                      placeholder="αν υπάρχει"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Συνολική αξία (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.gross}
                    onChange={(e) => setForm({ ...form, gross: e.target.value })}
                    placeholder="όπως γράφει το παραστατικό"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ΦΠΑ (%)</label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {VAT_RATES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setForm({ ...form, vatRate: String(r) })}
                        className={`px-3 py-2 text-xs font-medium rounded-lg border transition ${
                          parseFloat(form.vatRate) === r
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "border-gray-300 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {r}%
                      </button>
                    ))}
                    <span className="text-xs text-gray-400 px-1">ή</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={form.vatRate}
                      onChange={(e) => setForm({ ...form, vatRate: e.target.value })}
                      aria-label="Ποσοστό ΦΠΑ"
                      className="w-20 px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-sm flex flex-wrap gap-x-5 gap-y-1">
                  <span>
                    <span className="text-gray-500">Καθαρή αξία</span>{" "}
                    <span className="font-semibold text-gray-900">€{money(formNet)}</span>
                  </span>
                  <span>
                    <span className="text-gray-500">ΦΠΑ</span>{" "}
                    <span className="font-semibold text-gray-900">€{money(formVat)}</span>
                  </span>
                  <span>
                    <span className="text-gray-500">Σύνολο</span>{" "}
                    <span className="font-bold text-gray-900">€{money(formGross)}</span>
                  </span>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Περιγραφή</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="π.χ. ΔΕΗ γραφείου, μπαταρίες UPS"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {form.category === "salaries" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Άτομο</label>
                    <input
                      type="text"
                      list="expense-people"
                      value={form.person}
                      onChange={(e) => setForm({ ...form, person: e.target.value })}
                      placeholder="όνομα"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <datalist id="expense-people">
                      {people.map((p) => (
                        <option key={p.id} value={p.full_name || p.email} />
                      ))}
                    </datalist>
                  </div>
                )}

                {form.category !== "salaries" && form.category !== "taxes" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Προμηθευτής</label>
                    <input
                      type="text"
                      value={form.supplier}
                      onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                )}

                {form.category === "bills" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Περίοδος τιμολόγησης <span className="text-gray-400 font-normal">(τι διάστημα αφορά ο λογαριασμός)</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Από</label>
                        <input
                          type="date"
                          value={form.period_start}
                          onChange={(e) => setForm({ ...form, period_start: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Έως</label>
                        <input
                          type="date"
                          min={form.period_start || undefined}
                          value={form.period_end}
                          onChange={(e) => setForm({ ...form, period_end: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {form.category === "parts" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Αρ. Χρεωστικού</label>
                      <input
                        type="text"
                        value={form.debit_number}
                        onChange={(e) => setForm({ ...form, debit_number: e.target.value })}
                        placeholder="π.χ. 12345"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Παραστατικό</label>
                      <select
                        value={form.document_type}
                        onChange={(e) =>
                          setForm({ ...form, document_type: e.target.value as "" | "sale_confirmation" | "cash_register" })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="">— Επέλεξε —</option>
                        <option value="sale_confirmation">Βεβαίωση Πώλησης</option>
                        <option value="cash_register">Αριθμός Ταμειακής</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ημ. Έκδοσης</label>
                      <input
                        type="date"
                        value={form.receipt_date}
                        onChange={(e) => setForm({ ...form, receipt_date: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Ημ. Εξόφλησης <span className="text-gray-400 font-normal">(κενό = εκκρεμεί)</span>
                      </label>
                      <input
                        type="date"
                        value={form.payment_date}
                        onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>
                )}

                {(form.category === "parts" || form.category === "salaries" || form.category === "other") && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Μετρητά που έφυγαν από την εταιρεία (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.cash_received}
                      onChange={(e) => setForm({ ...form, cash_received: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                )}

                {form.category === "parts" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Τιμολόγιο PDF <span className="text-gray-400 font-normal">(προαιρετικό)</span>
                    </label>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) await handlePdfUpload(file);
                      }}
                      className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    {uploadingPdf && <p className="text-xs text-blue-600 mt-1">Ανέβασμα...</p>}
                    {form.pdf_url && !uploadingPdf && (
                      <div className="flex items-center gap-3 mt-1">
                        <a
                          href={form.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 underline"
                        >
                          Προβολή PDF
                        </a>
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, pdf_url: "" })}
                          className="text-xs text-gray-500 hover:text-red-600"
                        >
                          Αφαίρεση
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {(form.category === "parts" || form.category === "other") && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ασανσέρ <span className="text-gray-400 font-normal">(αν αφορά συγκεκριμένο κτίριο)</span>
                    </label>
                    <SearchableSelect
                      options={elevatorOptions}
                      value={form.elevator_id}
                      onChange={(v) => setForm({ ...form, elevator_id: v })}
                      placeholder="Χωρίς κτίριο"
                      searchPlaceholder="Αναζήτηση διεύθυνσης ή περιοχής..."
                      emptyMessage="Δεν βρέθηκαν ασανσέρ"
                    />
                    {form.elevator_id && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, elevator_id: "" })}
                        className="text-xs text-gray-500 hover:text-gray-700 mt-1"
                      >
                        Καθαρισμός
                      </button>
                    )}
                  </div>
                )}

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
                    disabled={saving || uploadingPdf}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    {saving ? "Αποθήκευση..." : "Αποθήκευση"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            Δεν υπάρχουν έξοδα για αυτόν τον μήνα
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((e) => {
              const elevator = elevators.find((el) => el.id === e.elevator_id);
              const gross = Number(e.amount) + Number(e.vat || 0);
              return (
                <div key={e.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${CATEGORY_COLOR[e.category]}`}>
                          {CATEGORY_LABEL[e.category]}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(e.date).toLocaleDateString("el-GR")}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 mt-1">
                        {e.description || CATEGORY_LABEL[e.category]}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
                        {e.person && <span>{e.person}</span>}
                        {e.supplier && <span>{e.supplier}</span>}
                        {elevator && <span className="text-blue-600">{elevator.address}</span>}
                        {e.debit_number && <span>Χρεωστικό: {e.debit_number}</span>}
                        {e.document_type && (
                          <span>
                            {e.document_type === "sale_confirmation" ? "Βεβαίωση Πώλησης" : "Ταμειακή"}
                            {e.document_number ? ` #${e.document_number}` : ""}
                          </span>
                        )}
                        {e.document_number && !e.document_type && (
                          <span>{e.category === "parts" ? "Τιμ." : "Παρ."} {e.document_number}</span>
                        )}
                        {e.period_start && e.period_end && (
                          <span>
                            Περίοδος: {new Date(e.period_start).toLocaleDateString("el-GR")} – {new Date(e.period_end).toLocaleDateString("el-GR")}
                          </span>
                        )}
                        {e.cash_received != null && (
                          <span className="text-gray-700 font-medium">Μετρητά: €{money(Number(e.cash_received))}</span>
                        )}
                        {e.category === "parts" &&
                          (e.payment_date ? (
                            <span className="text-green-600">
                              Εξοφλήθηκε: {new Date(e.payment_date).toLocaleDateString("el-GR")}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                              Εκκρεμεί εξόφληση
                            </span>
                          ))}
                        {e.pdf_url && (
                          <a
                            href={e.pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            PDF
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-gray-900">€{money(gross)}</p>
                      {Number(e.vat) > 0 && (
                        <p className="text-xs text-gray-400">+ΦΠΑ €{money(Number(e.vat))}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button onClick={() => openEdit(e)} className="text-xs text-gray-400 hover:text-blue-600">
                        Επεξ.
                      </button>
                      <button onClick={() => deleteExpense(e.id)} className="text-xs text-gray-400 hover:text-red-600">
                        Διαγρ.
                      </button>
                    </div>
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
