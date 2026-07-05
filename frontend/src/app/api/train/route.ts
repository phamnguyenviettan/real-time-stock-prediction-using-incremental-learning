import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get("ticker") || "AAPL";
    const action = searchParams.get("action") || "status";

    const url = new URL("http://127.0.0.1:5000/api/train");
    url.searchParams.set("ticker", ticker);
    url.searchParams.set("action", action);

    // Disable caching in Next.js Server Side fetch
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error("Không thể kết nối đến Flask backend để lấy trạng thái.");
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get("ticker") || "AAPL";
    const action = searchParams.get("action") || "start";
    const maxTicks = searchParams.get("max_ticks") || "100";

    const url = new URL("http://127.0.0.1:5000/api/train");
    url.searchParams.set("ticker", ticker);
    url.searchParams.set("action", action);
    url.searchParams.set("max_ticks", maxTicks);

    // Disable caching
    const res = await fetch(url.toString(), { 
      method: "POST",
      cache: "no-store"
    });
    if (!res.ok) throw new Error("Không thể khởi động tiến trình huấn luyện qua Flask.");
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
