import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params;
    const res = await fetch(`http://127.0.0.1:5000/api/tickers/${ticker}/stats`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Không thể lấy thống kê cho ${ticker} từ Flask backend.`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
