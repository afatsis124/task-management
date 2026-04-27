"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import AppLayout from "@/components/AppLayout";
import type { Elevator, Task, RepairRecord, SparePart, RepairDocument, Payment } from "@/lib/types";
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

const repairStatusConfig = {
  pending: { label: "Εκκρεμεί", bg: "bg-amber-100", text: "text-amber-700" },
  in_progress: { label: "Σε εξέλιξη", bg: "bg-blue-100", text: "text-blue-700" },
  completed: { label: "Ολοκληρώθηκε", bg: "bg-green-100", text: "text-green-700" },
};

const GREEK_MONTHS = ["", "Ιανουάριος", "Φεβρουάριος", "Μάρτιος", "Απρίλιος", "Μάιος", "Ιούνιος", "Ιούλιος", "Αύγουστος", "Σεπτέμβριος", "Οκτώβριος", "Νοέμβριος", "Δεκέμβριος"];

type Tab = "info" | "tasks" | "repairs" | "spare_parts" | "repair_docs" | "payments";

export default function ElevatorDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [elevator, setElevator] = useState<Elevator | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [repairs, setRepairs] = useState<RepairRecord[]>([]);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [repairDocs, setRepairDocs] = useState<RepairDocument[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tab, setTab] = useState<Tab>("info");
  const [loading, setLoading] = useState(true);

  // Spare part form
  const [showSpareForm, setShowSpareForm] = useState(false);
  const [editingSpart, setEditingSpart] = useState<SparePart | null>(null);
  const [spareForm, setSpareForm] = useState(emptySpareForm());
  const [savingSpart, setSavingSpart] = useState(false);

  // Repair doc form
  const [showRepairDocForm, setShowRepairDocForm] = useState(false);
  const [editingRepairDoc, setEditingRepairDoc] = useState<RepairDocument | null>(null);
  const [repairDocForm, setRepairDocForm] = useState(emptyRepairDocForm());
  const [savingRepairDoc, setSavingRepairDoc] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  // Payment form
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm());
  const [savingPayment, setSavingPayment] = useState(false);

  function emptySpareForm() {
    return {
      installation_date: "",
      description: "",
      price_without_vat: "",
      price_with_vat: "",
      debit_number: "",
      document_type: "" as "" | "sale_confirmation" | "cash_register",
      receipt_number: "",
      receipt_date: "",
      payment_date: "",
    };
  }

  function emptyRepairDocForm() {
    return { title: "", description: "", status: "pending" as "pending" | "in_progress" | "completed", pdf_url: "" };
  }

  function emptyPaymentForm() {
    const now = new Date();
    return {
      month: (now.getMonth() + 1).toString(),
      year: now.getFullYear().toString(),
      invoice_date: "",
      invoice_number: "",
      payment_date: "",
    };
  }

  const fetchData = useCallback(async () => {
    const [elevatorRes, tasksRes, repairsRes, spareRes, repairDocRes, paymentRes] = await Promise.all([
      supabase.from("elevators").select("*").eq("id", id).single(),
      supabase.from("tasks").select("*, assigned_user:profiles(full_name)").eq("elevator_id", id).order("created_at", { ascending: false }),
      supabase.from("repair_history").select("*, technician:profiles(full_name)").eq("elevator_id", id).order("repair_date", { ascending: false }),
      supabase.from("spare_parts").select("*").eq("elevator_id", id).order("installation_date", { ascending: false }),
      supabase.from("repair_documents").select("*").eq("elevator_id", id).order("created_at", { ascending: false }),
      supabase.from("payments").select("*").eq("elevator_id", id).order("year", { ascending: false }).order("month", { ascending: false }),
    ]);

    if (elevatorRes.data) setElevator(elevatorRes.data as Elevator);
    if (tasksRes.data) setTasks(tasksRes.data as unknown as Task[]);
    if (repairsRes.data) setRepairs(repairsRes.data as unknown as RepairRecord[]);
    if (spareRes.data) setSpareParts(spareRes.data as SparePart[]);
    if (repairDocRes.data) setRepairDocs(repairDocRes.data as RepairDocument[]);
    if (paymentRes.data) setPayments(paymentRes.data as Payment[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Spare parts CRUD ──
  const handleSaveSpart = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSpart(true);
    const payload = {
      elevator_id: id,
      installation_date: spareForm.installation_date,
      description: spareForm.description,
      price_without_vat: spareForm.price_without_vat ? parseFloat(spareForm.price_without_vat) : null,
      price_with_vat: spareForm.price_with_vat ? parseFloat(spareForm.price_with_vat) : null,
      debit_number: spareForm.debit_number || null,
      document_type: spareForm.document_type || null,
      receipt_number: spareForm.receipt_number || null,
      receipt_date: spareForm.receipt_date || null,
      payment_date: spareForm.payment_date || null,
    };
    if (editingSpart) {
      await supabase.from("spare_parts").update(payload).eq("id", editingSpart.id);
    } else {
      await supabase.from("spare_parts").insert(payload);
    }
    setShowSpareForm(false);
    setEditingSpart(null);
    setSpareForm(emptySpareForm());
    setSavingSpart(false);
    fetchData();
  };

  const openEditSpart = (s: SparePart) => {
    setEditingSpart(s);
    setSpareForm({
      installation_date: s.installation_date,
      description: s.description,
      price_without_vat: s.price_without_vat?.toString() ?? "",
      price_with_vat: s.price_with_vat?.toString() ?? "",
      debit_number: s.debit_number ?? "",
      document_type: s.document_type ?? "",
      receipt_number: s.receipt_number ?? "",
      receipt_date: s.receipt_date ?? "",
      payment_date: s.payment_date ?? "",
    });
    setShowSpareForm(true);
  };

  const deleteSpart = async (partId: string) => {
    if (!confirm("Διαγραφή ανταλλακτικού;")) return;
    await supabase.from("spare_parts").delete().eq("id", partId);
    fetchData();
  };

  // ── Repair docs CRUD ──
  const handlePdfUpload = async (file: File): Promise<string | null> => {
    setUploadingPdf(true);
    const path = `${id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("repair-pdfs").upload(path, file);
    setUploadingPdf(false);
    if (error) { alert("Σφάλμα upload: " + error.message); return null; }
    const { data } = supabase.storage.from("repair-pdfs").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSaveRepairDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRepairDoc(true);
    const payload = {
      elevator_id: id,
      title: repairDocForm.title,
      description: repairDocForm.description || null,
      pdf_url: repairDocForm.pdf_url || null,
      status: repairDocForm.status,
    };
    if (editingRepairDoc) {
      await supabase.from("repair_documents").update(payload).eq("id", editingRepairDoc.id);
    } else {
      await supabase.from("repair_documents").insert(payload);
    }
    setShowRepairDocForm(false);
    setEditingRepairDoc(null);
    setRepairDocForm(emptyRepairDocForm());
    setSavingRepairDoc(false);
    fetchData();
  };

  const openEditRepairDoc = (r: RepairDocument) => {
    setEditingRepairDoc(r);
    setRepairDocForm({ title: r.title, description: r.description ?? "", status: r.status, pdf_url: r.pdf_url ?? "" });
    setShowRepairDocForm(true);
  };

  const deleteRepairDoc = async (docId: string) => {
    if (!confirm("Διαγραφή επισκευής;")) return;
    await supabase.from("repair_documents").delete().eq("id", docId);
    fetchData();
  };

  // ── Payments CRUD ──
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPayment(true);
    const payload = {
      elevator_id: id,
      month: parseInt(paymentForm.month),
      year: parseInt(paymentForm.year),
      invoice_date: paymentForm.invoice_date || null,
      invoice_number: paymentForm.invoice_number || null,
      payment_date: paymentForm.payment_date || null,
    };
    if (editingPayment) {
      await supabase.from("payments").update(payload).eq("id", editingPayment.id);
    } else {
      await supabase.from("payments").insert(payload);
    }
    setShowPaymentForm(false);
    setEditingPayment(null);
    setPaymentForm(emptyPaymentForm());
    setSavingPayment(false);
    fetchData();
  };

  const openEditPayment = (p: Payment) => {
    setEditingPayment(p);
    setPaymentForm({
      month: p.month.toString(),
      year: p.year.toString(),
      invoice_date: p.invoice_date ?? "",
      invoice_number: p.invoice_number ?? "",
      payment_date: p.payment_date ?? "",
    });
    setShowPaymentForm(true);
  };

  const deletePayment = async (payId: string) => {
    if (!confirm("Διαγραφή πληρωμής;")) return;
    await supabase.from("payments").delete().eq("id", payId);
    fetchData();
  };

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
            <InfoItem label="Τελευταία Πιστοποίηση" value={elevator.certification_date ? new Date(elevator.certification_date).toLocaleDateString("el-GR") : "—"} />
            <InfoItem label="Λήξη Πιστοποίησης" value={certExpiry ? certExpiry.toLocaleDateString("el-GR") : "—"} highlight={isExpired ? "red" : isExpiringSoon ? "amber" : undefined} />
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
            { key: "repairs", label: `Ιστορικό` },
            { key: "spare_parts", label: `Ανταλλακτικά (${spareParts.length})` },
            { key: "repair_docs", label: `Επισκευές (${repairDocs.length})` },
            { key: "payments", label: `Πληρωμές (${payments.length})` },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-2 text-sm font-medium rounded-md transition whitespace-nowrap ${
                tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── INFO TAB ── */}
        {tab === "info" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Γενικά Στοιχεία</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <InfoBlock label="Διεύθυνση" value={`${elevator.address}, ${elevator.area}`} />
                <InfoBlock label="Μηνιαίο Κόστος" value={`€${elevator.monthly_fee}`} />
                <InfoBlock label="Όροφοι" value={elevator.floors.toString()} />
                <InfoBlock label="Πιστοποίηση" value={`${elevator.certification_date ? new Date(elevator.certification_date).toLocaleDateString("el-GR") : "—"} → ${certExpiry ? certExpiry.toLocaleDateString("el-GR") : "—"}`} />
                {elevator.registry_number && <InfoBlock label="Αρ. Μητρώου" value={elevator.registry_number} />}
                {elevator.protocol_number && <InfoBlock label="Αρ. Πρωτοκόλλου" value={elevator.protocol_number} />}
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Επαφή</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <InfoBlock label="Όνομα" value={elevator.contact_name} />
                <InfoBlock label="Τηλέφωνο" value={elevator.contact_phone} />
                {elevator.contact_email && <InfoBlock label="Email" value={elevator.contact_email} />}
              </div>
            </div>

            {(elevator.office_name || elevator.office_phone || elevator.office_address) && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Γραφείο Κοινοχρήστων</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  {elevator.office_name && <InfoBlock label="Όνομα" value={elevator.office_name} />}
                  {elevator.office_phone && <InfoBlock label="Τηλέφωνο" value={elevator.office_phone} />}
                  {elevator.office_address && <InfoBlock label="Διεύθυνση" value={elevator.office_address} />}
                  {elevator.office_email && <InfoBlock label="Email" value={elevator.office_email} />}
                  {elevator.office_hours && <InfoBlock label="Ωράριο" value={elevator.office_hours} />}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TASKS TAB ── */}
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
                          {task.due_date && <p className="text-xs text-gray-500">Προθεσμία: {new Date(task.due_date).toLocaleDateString("el-GR")}</p>}
                        </div>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${priority.bg} ${priority.text}`}>{priority.label}</span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${status.bg} ${status.text}`}>{status.label}</span>
                        <span className="text-xs text-gray-400 w-24 text-right truncate hidden sm:block">
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

        {/* ── REPAIR HISTORY TAB ── */}
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
                      <span className="text-xs text-gray-500">{new Date(repair.repair_date).toLocaleDateString("el-GR")}</span>
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

        {/* ── SPARE PARTS TAB ── */}
        {tab === "spare_parts" && (
          <div>
            <div className="flex justify-end mb-3">
              <button onClick={() => { setEditingSpart(null); setSpareForm(emptySpareForm()); setShowSpareForm(true); }} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition">
                + Νέο Ανταλλακτικό
              </button>
            </div>

            {showSpareForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">{editingSpart ? "Επεξεργασία" : "Νέο Ανταλλακτικό"}</h2>
                  <form onSubmit={handleSaveSpart} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Περιγραφή *</label>
                        <input required value={spareForm.description} onChange={(e) => setSpareForm({ ...spareForm, description: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Ημ. Τοποθέτησης *</label>
                        <input required type="date" value={spareForm.installation_date} onChange={(e) => setSpareForm({ ...spareForm, installation_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Αρ. Χρεωστικού</label>
                        <input value={spareForm.debit_number} onChange={(e) => setSpareForm({ ...spareForm, debit_number: e.target.value })} placeholder="π.χ. 12345" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Τιμή χωρίς ΦΠΑ (€)</label>
                        <input type="number" step="0.01" value={spareForm.price_without_vat} onChange={(e) => setSpareForm({ ...spareForm, price_without_vat: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Τιμή με ΦΠΑ (€)</label>
                        <input type="number" step="0.01" value={spareForm.price_with_vat} onChange={(e) => setSpareForm({ ...spareForm, price_with_vat: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Παραστατικό</label>
                        <select value={spareForm.document_type} onChange={(e) => setSpareForm({ ...spareForm, document_type: e.target.value as "" | "sale_confirmation" | "cash_register" })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                          <option value="">— Επέλεξε —</option>
                          <option value="sale_confirmation">Βεβαίωση Πώλησης</option>
                          <option value="cash_register">Αριθμός Ταμειακής</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Αρ. Ταμειακής / Τιμολογίου</label>
                        <input value={spareForm.receipt_number} onChange={(e) => setSpareForm({ ...spareForm, receipt_number: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Ημ. Έκδοσης</label>
                        <input type="date" value={spareForm.receipt_date} onChange={(e) => setSpareForm({ ...spareForm, receipt_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Ημ. Εξόφλησης <span className="text-gray-400 font-normal">(κενό = εκκρεμεί)</span></label>
                        <input type="date" value={spareForm.payment_date} onChange={(e) => setSpareForm({ ...spareForm, payment_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                      <button type="button" onClick={() => { setShowSpareForm(false); setEditingSpart(null); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Ακύρωση</button>
                      <button type="submit" disabled={savingSpart} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                        {savingSpart ? "Αποθήκευση..." : "Αποθήκευση"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {spareParts.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500">Δεν υπάρχουν ανταλλακτικά</div>
            ) : (
              <div className="space-y-2">
                {spareParts.map((sp) => (
                  <div key={sp.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{sp.description}</p>
                        <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                          <span>Τοποθέτηση: {new Date(sp.installation_date).toLocaleDateString("el-GR")}</span>
                          {sp.price_with_vat != null && <span>Τιμή με ΦΠΑ: €{sp.price_with_vat}</span>}
                          {sp.price_without_vat != null && <span>Χωρίς ΦΠΑ: €{sp.price_without_vat}</span>}
                          {sp.debit_number && <span>Χρεωστικό: {sp.debit_number}</span>}
                          {sp.document_type && <span>{sp.document_type === "sale_confirmation" ? "Βεβαίωση Πώλησης" : "Ταμειακή"}{sp.receipt_number ? ` #${sp.receipt_number}` : ""}</span>}
                        </div>
                        <div className="mt-1">
                          {sp.payment_date ? (
                            <span className="text-xs text-green-600">Εξοφλήθηκε: {new Date(sp.payment_date).toLocaleDateString("el-GR")}</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">Εκκρεμεί εξόφληση</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => openEditSpart(sp)} className="text-xs text-gray-400 hover:text-blue-600">Επεξ.</button>
                        <button onClick={() => deleteSpart(sp.id)} className="text-xs text-gray-400 hover:text-red-600">Διαγρ.</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── REPAIR DOCS TAB ── */}
        {tab === "repair_docs" && (
          <div>
            <div className="flex justify-end mb-3">
              <button onClick={() => { setEditingRepairDoc(null); setRepairDocForm(emptyRepairDocForm()); setShowRepairDocForm(true); }} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition">
                + Νέα Επισκευή
              </button>
            </div>

            {showRepairDocForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">{editingRepairDoc ? "Επεξεργασία" : "Νέα Επισκευή"}</h2>
                  <form onSubmit={handleSaveRepairDoc} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Τίτλος *</label>
                      <input required value={repairDocForm.title} onChange={(e) => setRepairDocForm({ ...repairDocForm, title: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Περιγραφή</label>
                      <textarea rows={3} value={repairDocForm.description} onChange={(e) => setRepairDocForm({ ...repairDocForm, description: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Κατάσταση</label>
                      <select value={repairDocForm.status} onChange={(e) => setRepairDocForm({ ...repairDocForm, status: e.target.value as "pending" | "in_progress" | "completed" })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                        <option value="pending">Εκκρεμεί</option>
                        <option value="in_progress">Σε εξέλιξη</option>
                        <option value="completed">Ολοκληρώθηκε</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ανέβασμα PDF</label>
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const url = await handlePdfUpload(file);
                          if (url) setRepairDocForm({ ...repairDocForm, pdf_url: url });
                        }}
                        className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      {uploadingPdf && <p className="text-xs text-blue-600 mt-1">Ανέβασμα...</p>}
                      {repairDocForm.pdf_url && !uploadingPdf && (
                        <a href={repairDocForm.pdf_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline mt-1 block">Προβολή PDF</a>
                      )}
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                      <button type="button" onClick={() => { setShowRepairDocForm(false); setEditingRepairDoc(null); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Ακύρωση</button>
                      <button type="submit" disabled={savingRepairDoc || uploadingPdf} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                        {savingRepairDoc ? "Αποθήκευση..." : "Αποθήκευση"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {repairDocs.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500">Δεν υπάρχουν επισκευές</div>
            ) : (
              <div className="space-y-2">
                {repairDocs.map((rd) => {
                  const st = repairStatusConfig[rd.status];
                  return (
                    <div key={rd.id} className="bg-white rounded-xl border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-gray-900">{rd.title}</p>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
                          </div>
                          {rd.description && <p className="text-xs text-gray-500 mt-1">{rd.description}</p>}
                          {rd.pdf_url && (
                            <a href={rd.pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-1 text-xs text-blue-600 hover:underline">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              Άνοιγμα PDF
                            </a>
                          )}
                          <p className="text-xs text-gray-400 mt-1">{new Date(rd.created_at).toLocaleDateString("el-GR")}</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button onClick={() => openEditRepairDoc(rd)} className="text-xs text-gray-400 hover:text-blue-600">Επεξ.</button>
                          <button onClick={() => deleteRepairDoc(rd.id)} className="text-xs text-gray-400 hover:text-red-600">Διαγρ.</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── PAYMENTS TAB ── */}
        {tab === "payments" && (
          <div>
            <div className="flex justify-end mb-3">
              <button onClick={() => { setEditingPayment(null); setPaymentForm(emptyPaymentForm()); setShowPaymentForm(true); }} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition">
                + Νέα Πληρωμή
              </button>
            </div>

            {showPaymentForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">{editingPayment ? "Επεξεργασία" : "Νέα Πληρωμή"}</h2>
                  <form onSubmit={handleSavePayment} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Μήνας *</label>
                        <select required value={paymentForm.month} onChange={(e) => setPaymentForm({ ...paymentForm, month: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                          {GREEK_MONTHS.slice(1).map((m, i) => (
                            <option key={i + 1} value={i + 1}>{m}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Έτος *</label>
                        <input required type="number" value={paymentForm.year} onChange={(e) => setPaymentForm({ ...paymentForm, year: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Ημ. Έκδοσης Τιμολογίου</label>
                        <input type="date" value={paymentForm.invoice_date} onChange={(e) => setPaymentForm({ ...paymentForm, invoice_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Αρ. Τιμολογίου</label>
                        <input value={paymentForm.invoice_number} onChange={(e) => setPaymentForm({ ...paymentForm, invoice_number: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Ημ. Πληρωμής <span className="text-gray-400 font-normal">(κενό = εκκρεμεί)</span></label>
                        <input type="date" value={paymentForm.payment_date} onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                      <button type="button" onClick={() => { setShowPaymentForm(false); setEditingPayment(null); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Ακύρωση</button>
                      <button type="submit" disabled={savingPayment} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                        {savingPayment ? "Αποθήκευση..." : "Αποθήκευση"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {payments.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500">Δεν υπάρχουν πληρωμές</div>
            ) : (
              <div className="space-y-2">
                {payments.map((p) => (
                  <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{GREEK_MONTHS[p.month]} {p.year}</p>
                        <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                          {p.invoice_number && <span>Τιμολόγιο: {p.invoice_number}</span>}
                          {p.invoice_date && <span>Έκδοση: {new Date(p.invoice_date).toLocaleDateString("el-GR")}</span>}
                        </div>
                        <div className="mt-1">
                          {p.payment_date ? (
                            <span className="text-xs text-green-600">Πληρώθηκε: {new Date(p.payment_date).toLocaleDateString("el-GR")}</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">Εκκρεμεί πληρωμή</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => openEditPayment(p)} className="text-xs text-gray-400 hover:text-blue-600">Επεξ.</button>
                        <button onClick={() => deletePayment(p.id)} className="text-xs text-gray-400 hover:text-red-600">Διαγρ.</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
      <p className={`text-sm font-medium ${highlight === "red" ? "text-red-600" : highlight === "amber" ? "text-amber-600" : "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-gray-500 text-xs">{label}</p>
      <p className="font-medium text-gray-900 text-sm">{value}</p>
    </div>
  );
}
