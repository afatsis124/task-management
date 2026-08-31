"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import AppLayout from "@/components/AppLayout";
import { matchesSearch } from "@/lib/search";

/*
 * Ανάλυση — where the money actually goes.
 *
 * Invoiced per building = maintenance payments + repair jobs (Επισκευές tab) + parts charged
 * Collected              = the same rows, but only where a payment date is filled in
 * Owed                   = invoiced − collected (what the building still has to pay us)
 * Direct cost per bldg  = expenses linked to that elevator (mostly parts we bought)
 * Building result       = income − direct costs
 * Overheads             = expenses with no building (fuel, salaries, taxes, bills)
 * Company net           = all income − all direct costs − overheads
 *
 * Overheads are deliberately NOT spread across buildings — a building's number
 * answers "does this building pay for itself", the company number answers
 * "does the company make money".
 */

interface ElevatorRow {
  id: string;
  address: string;
  area: string;
  monthly_fee: number | null;
  status: string;
}
interface PaymentRow {
  elevator_id: string;
  month: number;
  year: number;
  amount: number | null;
  payment_date: string | null;
}
interface RepairRow {
  elevator_id: string;
  amount: number | null;
  created_at: string;
  payment_date: string | null;
}
interface PartRow {
  elevator_id: string;
  price_without_vat: number | null;
  price_with_vat: number | null;
  installation_date: string;
  payment_date: string | null;
}
interface ExpenseRow {
  elevator_id: string | null;
  category: string;
  amount: number;
  date: string;
}

const OVERHEAD_LABEL: Record<string, string> = {
  parts: "Ανταλλακτικά",
  fuel: "Καύσιμα / Οχήματα",
  salaries: "Μισθοί",
  taxes: "Φόροι / Εισφορές",
  bills: "Λογαριασμοί",
  other: "Άλλα",
};

const MONTH_NAMES = ["Ιαν", "Φεβ", "Μάρ", "Απρ", "Μάι", "Ιούν", "Ιούλ", "Αύγ", "Σεπ", "Οκτ", "Νοέ", "Δεκ"];

function money(n: number): string {
  return n.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Parts income is counted net; when only the με-ΦΠΑ price is filled in, strip 24%. */
function partNet(p: PartRow): number {
  if (p.price_without_vat != null) return Number(p.price_without_vat);
  if (p.price_with_vat != null) return Math.round((Number(p.price_with_vat) / 1.24) * 100) / 100;
  return 0;
}

function monthOf(dateStr: string): number {
  const m = Number(dateStr.slice(5, 7));
  return m >= 1 && m <= 12 ? m : 1;
}

export default function AnalysisPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [elevators, setElevators] = useState<ElevatorRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [repairs, setRepairs] = useState<RepairRow[]>([]);
  const [parts, setParts] = useState<PartRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showIdle, setShowIdle] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const { data: auth } = await supabase.auth.getUser();
    const [profRes, elevRes, payRes, repRes, partRes, expRes] = await Promise.all([
      auth.user
        ? supabase.from("profiles").select("role").eq("id", auth.user.id).single()
        : Promise.resolve({ data: null }),
      supabase.from("elevators").select("id, address, area, monthly_fee, status"),
      supabase.from("payments").select("elevator_id, month, year, amount, payment_date").eq("year", year),
      supabase
        .from("repair_documents")
        .select("elevator_id, amount, created_at, payment_date")
        .gte("created_at", from)
        .lt("created_at", `${year + 1}-01-01`),
      supabase
        .from("spare_parts")
        .select("elevator_id, price_without_vat, price_with_vat, installation_date, payment_date")
        .gte("installation_date", from)
        .lte("installation_date", to),
      supabase.from("expenses").select("elevator_id, category, amount, date").gte("date", from).lte("date", to),
    ]);
    setRole((profRes.data as { role?: string } | null)?.role ?? null);
    setElevators((elevRes.data as ElevatorRow[]) ?? []);
    setPayments((payRes.data as PaymentRow[]) ?? []);
    setRepairs((repRes.data as RepairRow[]) ?? []);
    setParts((partRes.data as PartRow[]) ?? []);
    setExpenses((expRes.data as ExpenseRow[]) ?? []);
    setLoading(false);
  }, [year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  interface BuildingStat {
    elevator: ElevatorRow;
    fees: number;
    repairIncome: number;
    partIncome: number;
    directCosts: number;
    income: number;
    collected: number;
    owed: number;
    owedMonths: number;
    result: number;
  }

  const stats = useMemo(() => {
    const feeById = new Map(elevators.map((e) => [e.id, Number(e.monthly_fee ?? 0)]));
    const by = new Map<string, { fees: number; rep: number; part: number; cost: number; got: number; owedMonths: number }>();
    const bucket = (id: string) => {
      let b = by.get(id);
      if (!b) {
        b = { fees: 0, rep: 0, part: 0, cost: 0, got: 0, owedMonths: 0 };
        by.set(id, b);
      }
      return b;
    };

    const monthly = Array.from({ length: 12 }, () => ({ income: 0, costs: 0 }));

    for (const p of payments) {
      const v = p.amount != null ? Number(p.amount) : feeById.get(p.elevator_id) ?? 0;
      const b = bucket(p.elevator_id);
      b.fees += v;
      if (p.payment_date) b.got += v;
      else b.owedMonths += 1;
      if (p.month >= 1 && p.month <= 12) monthly[p.month - 1].income += v;
    }
    for (const r of repairs) {
      const v = Number(r.amount ?? 0);
      const b = bucket(r.elevator_id);
      b.rep += v;
      if (r.payment_date) b.got += v;
      monthly[monthOf(r.created_at) - 1].income += v;
    }
    for (const sp of parts) {
      const v = partNet(sp);
      const b = bucket(sp.elevator_id);
      b.part += v;
      if (sp.payment_date) b.got += v;
      monthly[monthOf(sp.installation_date) - 1].income += v;
    }

    const overheads: Record<string, number> = {};
    let directTotal = 0;
    let overheadTotal = 0;
    for (const ex of expenses) {
      const v = Number(ex.amount ?? 0);
      monthly[monthOf(ex.date) - 1].costs += v;
      if (ex.elevator_id) {
        bucket(ex.elevator_id).cost += v;
        directTotal += v;
      } else {
        overheads[ex.category] = (overheads[ex.category] ?? 0) + v;
        overheadTotal += v;
      }
    }

    const buildings: BuildingStat[] = elevators.map((e) => {
      const b = by.get(e.id) ?? { fees: 0, rep: 0, part: 0, cost: 0, got: 0, owedMonths: 0 };
      const income = b.fees + b.rep + b.part;
      return {
        elevator: e,
        fees: b.fees,
        repairIncome: b.rep,
        partIncome: b.part,
        directCosts: b.cost,
        income,
        collected: b.got,
        owed: Math.round((income - b.got) * 100) / 100,
        owedMonths: b.owedMonths,
        result: income - b.cost,
      };
    });
    buildings.sort((a, b) => b.result - a.result);

    const totalIncome = buildings.reduce((s, b) => s + b.income, 0);
    const totalCollected = buildings.reduce((s, b) => s + b.collected, 0);
    return {
      buildings,
      monthly,
      overheads,
      totalIncome,
      totalCollected,
      totalOwed: Math.round((totalIncome - totalCollected) * 100) / 100,
      directTotal,
      overheadTotal,
      net: totalIncome - directTotal - overheadTotal,
    };
  }, [elevators, payments, repairs, parts, expenses]);

  const visibleBuildings = useMemo(
    () =>
      stats.buildings.filter((b) => {
        const active = b.income !== 0 || b.directCosts !== 0;
        if (!showIdle && !active) return false;
        return matchesSearch(search, b.elevator.address, b.elevator.area);
      }),
    [stats.buildings, search, showIdle]
  );

  const idleCount = stats.buildings.filter((b) => b.income === 0 && b.directCosts === 0).length;
  const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];
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
        <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Ανάλυση</h1>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-gray-400 mb-6">
          Ποσά χωρίς ΦΠΑ. «Εισπράχθηκαν» μετράει μόνο ό,τι έχει συμπληρωμένη ημερομηνία πληρωμής.
        </p>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : (
          <>
            {/* What we billed, what actually came in, what is still out there */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500">Τιμολογήθηκαν</p>
                <p className="text-xl font-bold text-gray-900 mt-1">€{money(stats.totalIncome)}</p>
                <p className="text-xs text-gray-400 mt-0.5">η δουλειά που έγινε</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500">Εισπράχθηκαν</p>
                <p className="text-xl font-bold text-green-600 mt-1">€{money(stats.totalCollected)}</p>
                <p className="text-xs text-gray-400 mt-0.5">τα λεφτά που ήρθαν</p>
              </div>
              <div className={`rounded-xl border p-4 ${stats.totalOwed > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"}`}>
                <p className="text-xs text-gray-500">Μας χρωστούν</p>
                <p className={`text-xl font-bold mt-1 ${stats.totalOwed > 0 ? "text-amber-700" : "text-gray-900"}`}>
                  €{money(stats.totalOwed)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">τιμολογημένα, απλήρωτα</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500">Άμεσα κόστη κτιρίων</p>
                <p className="text-xl font-bold text-gray-900 mt-1">€{money(stats.directTotal)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500">Γενικά έξοδα</p>
                <p className="text-xl font-bold text-gray-900 mt-1">€{money(stats.overheadTotal)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500">Καθαρό αποτέλεσμα</p>
                <p className={`text-xl font-bold mt-1 ${stats.net >= 0 ? "text-green-600" : "text-red-600"}`}>
                  €{money(stats.net)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">σε τιμολογημένα</p>
              </div>
            </div>

            {/* Who owes us */}
            {(() => {
              const debtors = stats.buildings
                .filter((b) => b.owed > 0.005)
                .sort((a, b) => b.owed - a.owed);
              if (debtors.length === 0) return null;
              return (
                <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h2 className="text-sm font-semibold text-gray-900">Τι μας χρωστάνε</h2>
                    <span className="text-xs text-gray-400">{debtors.length} κτίρια</span>
                  </div>
                  <div className="space-y-1.5">
                    {debtors.map((b) => (
                      <div key={b.elevator.id} className="flex items-center justify-between gap-3 text-sm border-t border-gray-100 pt-1.5 first:border-0 first:pt-0">
                        <div className="min-w-0">
                          <p className="text-gray-900 truncate">{b.elevator.address}</p>
                          <p className="text-xs text-gray-400">
                            {b.elevator.area}
                            {b.owedMonths > 0 && ` · ${b.owedMonths} ${b.owedMonths === 1 ? "μήνας" : "μήνες"} συντήρηση`}
                          </p>
                        </div>
                        <span className="font-semibold text-amber-700 whitespace-nowrap">€{money(b.owed)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* Overheads breakdown */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Γενικά έξοδα ανά κατηγορία</h2>
                {Object.keys(stats.overheads).length === 0 ? (
                  <p className="text-sm text-gray-400">Δεν υπάρχουν γενικά έξοδα για το {year}</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(stats.overheads)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, v]) => (
                        <div key={cat} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">{OVERHEAD_LABEL[cat] ?? cat}</span>
                          <span className="font-medium text-gray-900">€{money(v)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Month by month */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Μήνας-μήνα</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400">
                        <th className="text-left font-medium pb-1">Μήνας</th>
                        <th className="text-right font-medium pb-1">Έσοδα</th>
                        <th className="text-right font-medium pb-1">Έξοδα</th>
                        <th className="text-right font-medium pb-1">Αποτέλεσμα</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.monthly.map((m, i) => {
                        const net = m.income - m.costs;
                        if (m.income === 0 && m.costs === 0) return null;
                        return (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="py-1 text-gray-600">{MONTH_NAMES[i]}</td>
                            <td className="py-1 text-right text-gray-900">€{money(m.income)}</td>
                            <td className="py-1 text-right text-gray-900">€{money(m.costs)}</td>
                            <td className={`py-1 text-right font-medium ${net >= 0 ? "text-green-600" : "text-red-600"}`}>
                              €{money(net)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Per building */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-sm font-semibold text-gray-900">Ανά κτίριο</h2>
                <label className="flex items-center gap-1.5 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={showIdle}
                    onChange={(e) => setShowIdle(e.target.checked)}
                    className="rounded"
                  />
                  Και χωρίς κίνηση ({idleCount})
                </label>
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Αναζήτηση διεύθυνσης ή περιοχής..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              />
              {visibleBuildings.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">Δεν βρέθηκαν κτίρια</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400">
                        <th className="text-left font-medium pb-2">Κτίριο</th>
                        <th className="text-right font-medium pb-2">Συντηρήσεις</th>
                        <th className="text-right font-medium pb-2">Επισκευές</th>
                        <th className="text-right font-medium pb-2">Ανταλλακτικά</th>
                        <th className="text-right font-medium pb-2">Εισπράχθηκαν</th>
                        <th className="text-right font-medium pb-2">Χρωστούν</th>
                        <th className="text-right font-medium pb-2">Κόστη</th>
                        <th className="text-right font-medium pb-2">Αποτέλεσμα</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleBuildings.map((b) => (
                        <tr key={b.elevator.id} className="border-t border-gray-100">
                          <td className="py-2 pr-3">
                            <p className="text-gray-900 font-medium whitespace-nowrap">{b.elevator.address}</p>
                            <p className="text-xs text-gray-400">{b.elevator.area}</p>
                          </td>
                          <td className="py-2 text-right text-gray-700 whitespace-nowrap">€{money(b.fees)}</td>
                          <td className="py-2 text-right text-gray-700 whitespace-nowrap">€{money(b.repairIncome)}</td>
                          <td className="py-2 text-right text-gray-700 whitespace-nowrap">€{money(b.partIncome)}</td>
                          <td className="py-2 text-right text-green-700 whitespace-nowrap">€{money(b.collected)}</td>
                          <td className={`py-2 text-right whitespace-nowrap ${b.owed > 0.005 ? "text-amber-700 font-medium" : "text-gray-300"}`}>
                            €{money(b.owed)}
                          </td>
                          <td className="py-2 text-right text-gray-700 whitespace-nowrap">€{money(b.directCosts)}</td>
                          <td
                            className={`py-2 text-right font-semibold whitespace-nowrap ${
                              b.result >= 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            €{money(b.result)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
