
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ip, command, params } = body;

    if (!ip || !command) {
      return NextResponse.json({ error: 'Missing ip or command' }, { status: 400 });
    }
    
    // The ESP32's WebServer library expects POST data in the body, not query params.
    // We'll create a URL-encoded string for the body.
    const formBody = new URLSearchParams(params).toString();
    const targetUrl = `${ip}/${command}`;

    console.log(`[ESP32 PROXY] Sending POST command to: ${targetUrl} with body: ${formBody}`);

    // IMPORTANT: This fetch happens on the server, so it's not a mixed-content violation.
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: formBody,
    });

    if (response.ok) {
      const responseText = await response.text();
      return NextResponse.json({ message: `Successfully sent command to ESP32. Response: ${responseText}` });
    } else {
      const errorText = await response.text();
      console.error(`[ESP32 PROXY] ESP32 Error Response: ${errorText}`);
      return NextResponse.json({ error: `ESP32 responded with status ${response.status}: ${errorText}` }, { status: response.status });
    }
  } catch (error: any) {
    console.error('ESP32 proxy error:', error);
    return NextResponse.json({ error: `Failed to send command to ESP32: ${error.message}` }, { status: 500 });
  }
}
