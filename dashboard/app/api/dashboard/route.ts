import { NextResponse } from "next/server";

const AGENT_API_URL = process.env.AGENT_API_URL || "http://localhost:3001";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${AGENT_API_URL}/api/dashboard`, {
      headers: { "bypass-tunnel-reminder": "true" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Agent API ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Agent offline" },
      { status: 502 }
    );
  }
}
