import { NextResponse } from "next/server";
import { isAllowedGoogleMapsUrl, parseGoogleMapsUrl } from "@/lib/google-maps-link";

export const runtime = "nodejs";

const MAX_REDIRECTS = 5;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: unknown };
    const originalUrl = typeof body.url === "string" ? body.url.trim() : "";
    if (originalUrl.length > 2048 || !isAllowedGoogleMapsUrl(originalUrl)) {
      return NextResponse.json({ error: "กรุณาใช้ลิงก์ HTTPS จาก Google Maps เท่านั้น" }, { status: 400 });
    }

    let resolvedUrl = originalUrl;
    for (let redirect = 0; redirect < MAX_REDIRECTS; redirect += 1) {
      try {
        return NextResponse.json(parseGoogleMapsUrl(originalUrl, resolvedUrl));
      } catch (error) {
        if (redirect === MAX_REDIRECTS - 1 && !resolvedUrl.includes("maps.app.goo.gl")) throw error;
      }

      const response = await fetch(resolvedUrl, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
        headers: { "User-Agent": "SFastTransport/1.0 GoogleMapsLinkResolver" }
      });
      const location = response.headers.get("location");
      if (!location) break;
      const nextUrl = new URL(location, resolvedUrl).href;
      if (!isAllowedGoogleMapsUrl(nextUrl)) {
        return NextResponse.json({ error: "ลิงก์นำไปยังเว็บไซต์ที่ไม่ได้รับอนุญาต" }, { status: 400 });
      }
      resolvedUrl = nextUrl;
    }

    return NextResponse.json(parseGoogleMapsUrl(originalUrl, resolvedUrl));
  } catch (error) {
    const message = error instanceof Error ? error.message : "อ่านลิงก์ Google Maps ไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

