"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import AppLayout from "@/components/AppLayout";
import Link from "next/link";
import type { Elevator } from "@/lib/types";

interface MaintenanceSchedule {
  id: string;
  elevator_id: string;
  frequency_months: number;
}

type Severity = "critical" | "important" | "minor";

interface Issue {
  key: string;
  label: string;
  help: string;
  severity: Severity;
  /** True when this elevator has the problem. */
  test: (e: Elevator, hasSchedule: boolean) => boolean;
}

const SEVERITY_META: Record<Severity, { label: string; dot: string; chip: string }> = {
  critical: { label: "Σοβαρό", dot: "bg-red-500", chip: "bg-red-100 text-red-700" },
  important: { label: "Σημαντικό", dot: "bg-amber-500", chip: "bg-amber-100 text-amber-700" },
  minor: { label: "Δευτερεύον", dot: "bg-gray-400", chip: "bg-gray-100 text-gray-600" },
};

/** Blank, a dash, a dot, or a row of question marks all mean "nobody filled this in". */
function isBlank(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  if (!v) return true;
  return /^[-.\s?_—–]+$/.test(v);
}

/** A usable phone number: at least 7 actual digits. */
function isUnusablePhone(value: string | null | undefined): boolean {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length < 7;
}

/** Names like "ΜΗΤΡΟΥΔΗΣ ????" are half-filled and worth flagging. */
function looksIncomplete(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  if (isBlank(v)) return true;
  return v.includes("?");
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / (24 * 60 * 60 * 1000));
}

const ISSUES: Issue[] = [
  {
    key: "phone",
    label: "Χωρίς τηλέφωνο επικοινωνίας",
    help: "Ο τεχνικός δεν μπορεί να καλέσει κανέναν από το κτίριο.",
    severity: "critical",
    test: (e) => isUnusablePhone(e.contact_phone),
  },
  {
    key: "contact",
    label: "Ελλιπές όνομα επαφής",
    help: "Κενό ή ημιτελές όνομα — δεν ξέρουμε ποιον ζητάμε.",
    severity: "critical",
    test: (e) => looksIncomplete(e.contact_name),
  },
  {
    key: "cert_expired",
    label: "Ληγμένη πιστοποίηση",
    help: "Η ημερομηνία λήξης έχει περάσει.",
    severity: "critical",
    test: (e) => {
      const d = daysUntil(e.certification_expiry);
      return d !== null && d < 0;
    },
  },
  {
    key: "cert_missing",
    label: "Χωρίς ημερομηνία λήξης πιστοποίησης",
    help: "Δεν μπορούμε να ξέρουμε πότε πρέπει να ανανεωθεί.",
    severity: "critical",
    test: (e) => isBlank(e.certification_expiry),
  },
  {
    key: "address",
    label: "Χωρίς διεύθυνση",
    help: "Το κτίριο δεν εντοπίζεται.",
    severity: "critical",
    test: (e) => isBlank(e.address),
  },
  {
    key: "schedule",
    label: "Χωρίς πρόγραμμα συντήρησης",
    help: "Δεν έχει οριστεί συχνότητα — μπορεί να μην εμφανίζεται ποτέ στις Συντηρήσεις.",
    severity: "important",
    test: (_e, hasSchedule) => !hasSchedule,
  },
  {
    key: "fee",
    label: "Μηνιαίο κόστος €0",
    help: "Είτε λείπει, είτε το κτίριο δεν χρεώνεται.",
    severity: "important",
    test: (e) => !e.monthly_fee || e.monthly_fee <= 0,
  },
  {
    key: "area",
    label: "Χωρίς περιοχή",
    help: "Δυσκολεύει την αναζήτηση και την ομαδοποίηση διαδρομών.",
    severity: "important",
    test: (e) => isBlank(e.area),
  },
  {
    key: "afm",
    label: "Επαγγελματικό χωρίς ΑΦΜ",
    help: "Χρειάζεται για την τιμολόγηση.",
    severity: "important",
    test: (e) => e.type === "professional" && isBlank(e.afm),
  },
  {
    key: "registry",
    label: "Χωρίς αρ. καταχώρησης μητρώου",
    help: "Ζητείται στους ελέγχους και στα έγγραφα του δήμου.",
    severity: "important",
    test: (e) => isBlank(e.registry_number),
  },
  {
    key: "cert_date",
    label: "Χωρίς ημερομηνία τελευταίας πιστοποίησης",
    help: "Χάνεται το ιστορικό των ελέγχων.",
    severity: "minor",
    test: (e) => isBlank(e.certification_date),
  },
  {
    key: "email",
    label: "Χωρίς email επικοινωνίας",
    help: "Δεν μπορούν να σταλούν ειδοποιήσεις ή τιμολόγια με email.",
    severity: "minor",
    test: (e) => isBlank(e.contact_email),
  },
  {
    key: "office",
    label: "Οικιακό χωρίς στοιχεία γραφείου κοινοχρήστων",
    help: "Ούτε όνομα ούτε τηλέφωνο γραφείου — συχνά εκεί γίνεται η πληρωμή.",
    severity: "minor",
    test: (e) =>
      e.type === "residential" && isBlank(e.office_name) && isUnusablePhone(e.office_phone),
  },
  {
    key: "protocol",
    label: "Χωρίς αρ. πρωτοκόλλου δήμου",
    help: "Συμπληρώνει τον φάκελο του ασανσέρ.",
    severity: "minor",
    test: (e) => isBlank(e.protocol_number),
  },
];

const SEVERITY_ORDER: Severity[] = ["critical", "important", "minor"];

export default function DataHealthPage() {
  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [scheduleIds, setScheduleIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showMinor, setShowMinor] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [openIssue, setOpenIssue] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [elevatorsRes, schedulesRes] = await Promise.all([
      supabase.from("elevators").select("*").order("address"),
      supabase.from("maintenance_schedules").select("id, elevator_id, frequency_months"),
    ]);
    if (elevatorsRes.data) setElevators(elevatorsRes.data as Elevator[]);
    if (schedulesRes.data) {
      setScheduleIds(
        new Set((schedulesRes.data as MaintenanceSchedule[]).map((s) => s.elevator_id))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const scoped = elevators.filter((e) => includeInactive || e.status === "active");
  const visibleIssues = ISSUES.filter((i) => showMinor || i.severity !== "minor");

  // Which elevators fail each check.
  const byIssue = visibleIssues
    .map((issue) => ({
      issue,
      elevators: scoped.filter((e) => issue.test(e, scheduleIds.has(e.id))),
    }))
    .filter((row) => row.elevators.length > 0)
    .sort((a, b) => {
      const sev =
        SEVERITY_ORDER.indexOf(a.issue.severity) - SEVERITY_ORDER.indexOf(b.issue.severity);
      if (sev !== 0) return sev;
      return b.elevators.length - a.elevators.length;
    });

  const flaggedIds = new Set(byIssue.flatMap((row) => row.elevators.map((e) => e.id)));
  const cleanCount = scoped.length - flaggedIds.size;
  const completePct = scoped.length > 0 ? Math.round((cleanCount / scoped.length) * 100) : 100;
  const criticalCount = byIssue
    .filter((r) => r.issue.severity === "critical")
    .reduce((n, r) => n + r.elevators.length, 0);

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Ποιότητα Δεδομένων</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Ασανσέρ με στοιχεία που λείπουν ή είναι ημιτελή. Κάθε γραμμή οδηγεί στην καρτέλα του
          ασανσέρ για συμπλήρωση.
        </p>

        {/* Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Πληρότητα στοιχείων</span>
            <span className="text-sm font-semibold text-gray-900">
              {cleanCount} / {scoped.length} πλήρη
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${
                completePct === 100 ? "bg-green-500" : completePct >= 60 ? "bg-blue-500" : "bg-amber-500"
              }`}
              style={{ width: `${completePct}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1 text-right">{completePct}%</p>
          {criticalCount > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 text-xs">
              <span className="text-red-600 font-medium">{criticalCount}</span>
              <span className="text-gray-500"> σοβαρά προβλήματα — ξεκίνα από αυτά</span>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showMinor}
              onChange={(e) => setShowMinor(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-gray-700">Και δευτερεύοντα</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-gray-700">Και ανενεργά ασανσέρ</span>
          </label>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : byIssue.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-900 font-medium">Όλα τα στοιχεία είναι συμπληρωμένα</p>
            <p className="text-sm text-gray-500 mt-1">
              {showMinor ? "Δεν βρέθηκε τίποτα." : "Δοκίμασε και τα δευτερεύοντα."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {byIssue.map(({ issue, elevators: hits }) => {
              const meta = SEVERITY_META[issue.severity];
              const isOpen = openIssue === issue.key;
              return (
                <div key={issue.key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setOpenIssue(isOpen ? null : issue.key)}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition"
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{issue.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{issue.help}</p>
                    </div>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${meta.chip}`}>
                      {hits.length}
                    </span>
                    <svg
                      className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                      {hits.map((e) => (
                        <Link
                          key={e.id}
                          href={`/elevators/${e.id}`}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50/50 transition"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-blue-600 truncate">
                              {isBlank(e.address) ? "(χωρίς διεύθυνση)" : e.address}
                            </p>
                            <p className="text-xs text-gray-400 truncate">
                              {isBlank(e.area) ? "—" : e.area}
                              {e.status !== "active" && (
                                <span className="ml-2 text-gray-400">
                                  · {e.status === "maintenance" ? "Συντήρηση" : "Ανενεργό"}
                                </span>
                              )}
                            </p>
                          </div>
                          <span className="text-xs text-gray-300 flex-shrink-0">→</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
