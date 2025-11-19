
import { NextRequest, NextResponse } from 'next/server';

// This is a server-side proxy, which is useful for environments where the client
// cannot directly reach the ESP32, but the server can. 
// It also helps bypass mixed-content issues when the app is deployed on HTTPS.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ip, command, params } = body;

    if (!ip || !command) {
      return NextResponse.json({ error: 'Missing ip or command' }, { status: 400 });
    }

    const queryParams = new URLSearchParams(params).toString();
    const targetUrl = `${ip}/${command}?${queryParams}`;

    console.log(`[API PROXY] Sending GET command to: ${targetUrl}`);

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      signal: AbortSignal.timeout(5000) 
    });

    const responseText = await response.text();

    if (response.ok) {
      return NextResponse.json({ message: `Successfully sent command to ESP32. Response: ${responseText}` });
    } else {
      console.error(`[API PROXY] ESP32 Error Response: ${responseText}`);
      return NextResponse.json({ error: `ESP32 responded with status ${response.status}: ${responseText}` }, { status: response.status });
    }
  } catch (error: any) {
    console.error('API proxy error:', error);
    if (error.name === 'AbortError' || error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || error.cause?.code === 'EHOSTUNREACH' || error.cause?.code === 'ENOTFOUND') {
        return NextResponse.json({ error: 'Failed to connect to ESP32 from server. Check network connectivity.' }, { status: 504 });
    }
    return NextResponse.json({ error: `Failed to send command via API proxy: ${error.message}` }, { status: 500 });
  }
}
