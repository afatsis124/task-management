import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function GET(req: NextRequest) {
  // Vercel cron sends Authorization: Bearer <secret>
  const authHeader = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  const isVercel = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = secret === process.env.CRON_SECRET;

  if (!isVercel && !isManual) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const in60 = new Date(today);
  in60.setDate(in60.getDate() + 60);

  const { data: elevators, error } = await supabase
    .from("elevators")
    .select("id, address, area, contact_name, contact_email, certification_expiry")
    .not("certification_expiry", "is", null)
    .lte("certification_expiry", in60.toISOString().split("T")[0])
    .eq("status", "active")
    .order("certification_expiry");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!elevators || elevators.length === 0) {
    return NextResponse.json({ message: "Δεν υπάρχουν ασανσέρ με επερχόμενη λήξη." });
  }

  const fmt = (d: string) => new Date(d).toLocaleDateString("el-GR");

  const daysUntil = (d: string) => {
    const diff = new Date(d).getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  let sent = 0;
  const skipped: string[] = [];

  for (const elevator of elevators) {
    if (!elevator.contact_email) {
      skipped.push(elevator.address);
      continue;
    }

    const days = daysUntil(elevator.certification_expiry);
    const isExpired = days < 0;

    const subject = isExpired
      ? `⚠️ Ληγμένη πιστοποίηση ασανσέρ — ${elevator.address}`
      : `🔔 Υπενθύμιση πιστοποίησης ασανσέρ — ${elevator.address}`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:${isExpired ? "#dc2626" : "#1e40af"};color:white;padding:24px;border-radius:8px 8px 0 0">
          <h1 style="margin:0;font-size:20px">
            ${isExpired ? "⚠️ Ληγμένη Πιστοποίηση" : "🔔 Υπενθύμιση Πιστοποίησης"}
          </h1>
          <p style="margin:6px 0 0;opacity:0.9;font-size:14px">House Lift — ${today.toLocaleDateString("el-GR")}</p>
        </div>
        <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
          <p style="font-size:15px">Αγαπητέ/ή <strong>${elevator.contact_name}</strong>,</p>
          <p style="font-size:15px">
            ${isExpired
              ? `Η πιστοποίηση του ασανσέρ στη διεύθυνση <strong>${elevator.address}, ${elevator.area}</strong> έχει <span style="color:#dc2626;font-weight:bold">ήδη λήξει</span> στις <strong>${fmt(elevator.certification_expiry)}</strong>.`
              : `Η πιστοποίηση του ασανσέρ στη διεύθυνση <strong>${elevator.address}, ${elevator.area}</strong> λήγει στις <strong>${fmt(elevator.certification_expiry)}</strong> (<span style="color:${days <= 30 ? "#d97706" : "#2563eb"};font-weight:bold">σε ${days} ημέρες</span>).`
            }
          </p>
          <p style="font-size:15px">Παρακαλούμε επικοινωνήστε μαζί μας για να προγραμματίσουμε τον ανανέωση της πιστοποίησης.</p>
          <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:20px 0;font-size:14px;color:#6b7280">
            <strong>Στοιχεία ασανσέρ:</strong><br/>
            Διεύθυνση: ${elevator.address}, ${elevator.area}<br/>
            Λήξη πιστοποίησης: ${fmt(elevator.certification_expiry)}
          </div>
          <p style="font-size:14px;color:#6b7280">Με εκτίμηση,<br/><strong>House Lift</strong><br/>${process.env.GMAIL_USER}</p>
        </div>
      </div>`;

    await transporter.sendMail({
      from: `"House Lift" <${process.env.GMAIL_USER}>`,
      to: elevator.contact_email,
      subject,
      html,
    });

    sent++;
  }

  return NextResponse.json({ sent, skipped_no_email: skipped });
}
