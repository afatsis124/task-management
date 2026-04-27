import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { to, taskTitle, assigneeName, priority } = await req.json();

    if (!to) {
      return NextResponse.json({ error: "Missing phone number" }, { status: 400 });
    }

    const toFormatted = to.replace(/^\+/, "");
    const priorityLabel = priority ?? "Νεα εργασια";
    const msg = `${priorityLabel}\nΤιτλος: ${taskTitle}\nΑνατεθηκε σε: ${assigneeName}`;

    const params = new URLSearchParams({
      username: process.env.BUDGETSMS_USERNAME!,
      userid: process.env.BUDGETSMS_USERID!,
      handle: process.env.BUDGETSMS_HANDLE!,
      from: process.env.BUDGETSMS_FROM ?? "TaskSOS",
      to: toFormatted,
      msg,
    });

    const response = await fetch(
      `https://api.budgetsms.net/sendsms/?${params.toString()}`
    );
    const result = await response.text();

    if (!result.startsWith("OK")) {
      console.error("BudgetSMS error:", result);
      return NextResponse.json({ error: result }, { status: 500 });
    }

    return NextResponse.json({ success: true, smsId: result.split(" ")[1] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("SMS error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
