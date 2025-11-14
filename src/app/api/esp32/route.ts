
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ip, command, params } = body;

    if (!ip || !command) {
      return NextResponse.json({ error: 'Missing ip or command' }, { status: 400 });
    }

    const queryParams = new URLSearchParams(params).toString();
    const targetUrl = `${ip}/${command}?${queryParams}`;

    // IMPORTANT: This fetch happens on the server, so it's not a mixed-content violation.
    const response = await fetch(targetUrl, {
      method: 'GET',
    });

    if (response.ok) {
      const responseText = await response.text();
      return NextResponse.json({ message: `Successfully sent command to ESP32. Response: ${responseText}` });
    } else {
      return NextResponse.json({ error: `ESP32 responded with status ${response.status}` }, { status: response.status });
    }
  } catch (error: any) {
    console.error('ESP32 proxy error:', error);
    return NextResponse.json({ error: `Failed to send command to ESP32: ${error.message}` }, { status: 500 });
  }
}
