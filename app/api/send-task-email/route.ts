import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function POST(req: NextRequest) {
  try {
    const { to, taskTitle, assigneeName, priority, description, due_date } = await req.json();

    if (!to) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    const priorityColor =
      priority === "SOS" ? "#dc2626" : priority === "Επείγον" ? "#d97706" : "#2563eb";

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:${priorityColor};color:white;padding:20px;border-radius:8px 8px 0 0">
          <h1 style="margin:0;font-size:18px">📋 Νέα Εργασία — ${priority}</h1>
          <p style="margin:4px 0 0;opacity:0.9;font-size:13px">House Lift</p>
        </div>
        <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
          <p style="font-size:15px">Αγαπητέ/ή <strong>${assigneeName}</strong>,</p>
          <p style="font-size:15px">Σου ανατέθηκε νέα εργασία:</p>
          <div style="background:#f9fafb;border-left:4px solid ${priorityColor};padding:16px;border-radius:0 8px 8px 0;margin:16px 0">
            <p style="margin:0 0 8px;font-size:16px;font-weight:bold">${taskTitle}</p>
            ${description ? `<p style="margin:0 0 8px;font-size:14px;color:#6b7280">${description}</p>` : ""}
            ${due_date ? `<p style="margin:0;font-size:13px;color:#6b7280">Προθεσμία: <strong>${new Date(due_date).toLocaleDateString("el-GR")}</strong></p>` : ""}
          </div>
          <p style="font-size:14px;color:#6b7280;margin-top:24px">Με εκτίμηση,<br/><strong>House Lift</strong></p>
        </div>
      </div>`;

    await transporter.sendMail({
      from: `"House Lift" <${process.env.GMAIL_USER}>`,
      to,
      subject: `[${priority}] Νέα εργασία: ${taskTitle}`,
      html,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Email error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
