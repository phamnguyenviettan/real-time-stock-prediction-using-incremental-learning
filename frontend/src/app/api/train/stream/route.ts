import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch("http://127.0.0.1:5000/api/train/stream", {
      cache: "no-store",
    });

    if (!response.ok || !response.body) {
      return new NextResponse("Không thể kết nối đến luồng stream Kafka.", { status: 500 });
    }

    // Forward the readable stream from Flask directly to the Next.js client
    return new NextResponse(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  } catch (error: any) {
    return new NextResponse(error.message, { status: 500 });
  }
}
