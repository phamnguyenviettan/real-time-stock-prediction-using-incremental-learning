import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params;
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") || "";

    const url = new URL(`http://127.0.0.1:5000/api/tickers/${ticker}/chart`);
    if (month) {
      url.searchParams.set("month", month);
    }

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error(`Không thể lấy dữ liệu biểu đồ cho ${ticker} từ Flask.`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
