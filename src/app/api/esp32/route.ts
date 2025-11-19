
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

    console.log(`[ESP32 PROXY] Sending GET command to: ${targetUrl}`);

    // The stable WebServer on ESP32 works best with GET requests.
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
    });

    const responseText = await response.text();

    if (response.ok) {
      // The ESP32's WebServer might close the connection without a full response,
      // so we treat an empty response as success in this case. Or we can check the text.
      return NextResponse.json({ message: `Successfully sent command to ESP32. Response: ${responseText}` });
    } else {
      console.error(`[ESP32 PROXY] ESP32 Error Response: ${errorText}`);
      return NextResponse.json({ error: `ESP32 responded with status ${response.status}: ${errorText}` }, { status: response.status });
    }
  } catch (error: any) {
    console.error('ESP32 proxy error:', error);
    // This is often a network error if the phone is not on the ESP32's WiFi.
    if (error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || error.cause?.code === 'EHOSTUNREACH' || error.cause?.code === 'ENOTFOUND') {
        return NextResponse.json({ error: 'Failed to connect to ESP32. Ensure you are connected to the SortVision-AP WiFi network.' }, { status: 504 });
    }
    return NextResponse.json({ error: `Failed to send command to ESP32: ${error.message}` }, { status: 500 });
  }
}
