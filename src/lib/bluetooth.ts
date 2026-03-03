
import { playConnectedSound, playDisconnectedSound } from './audio';

// UUIDs for the Bluetooth service and characteristics
// These MUST match the UUIDs programmed into your ESP32 Arduino sketch
const SORTER_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const COMMAND_CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const STATUS_CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a9";

export type ESP32Status = {
    sorterStatus: string;
    alcoholStatus: string;
    alcoholLevel: number;
    bioTrash: number;
    nonBioTrash: number;
    eWasteTrash: number;
};

let bluetoothDevice: any | null = null;
let commandCharacteristic: any | null = null;
let statusCharacteristic: any | null = null;
let latestStatus: ESP32Status = { sorterStatus: 'UNKNOWN', alcoholStatus: 'UNKNOWN', alcoholLevel: 0, bioTrash: 0, nonBioTrash: 0, eWasteTrash: 0 };

export function getLatestStatus(): ESP32Status {
    return { ...latestStatus };
}

function parseStatusString(raw: string): Partial<ESP32Status> {
    const result: Partial<ESP32Status> = {};
    const parts = raw.split(',');
    for (const part of parts) {
        const [key, val] = part.split(':');
        if (!key || !val) continue;
        const k = key.trim().toUpperCase();
        const v = val.trim();
        if (k === 'STATUS') result.sorterStatus = v;
        else if (k === 'ALCOHOL') result.alcoholStatus = v;
        else if (k === 'LEVEL') result.alcoholLevel = parseInt(v, 10) || 0;
        else if (k === 'BIO') result.bioTrash = parseInt(v, 10) || 0;
        else if (k === 'NONBIO') result.nonBioTrash = parseInt(v, 10) || 0;
        else if (k === 'EWASTE') result.eWasteTrash = parseInt(v, 10) || 0;
    }
    return result;
}

function onStatusNotification(event: Event) {
    try {
        const characteristic = event.target as any;
        const value = characteristic.value;
        const decoder = new TextDecoder();
        const raw = decoder.decode(value);
        console.log('BLE Status Update:', raw);

        const parsed = parseStatusString(raw);
        latestStatus = { ...latestStatus, ...parsed };

        window.dispatchEvent(new CustomEvent('bt-status-update', { detail: { ...latestStatus } }));
    } catch (err) {
        console.error('Error parsing BLE status notification:', err);
    }
}

export function isConnected(): boolean {
    return !!(bluetoothDevice && bluetoothDevice.gatt && bluetoothDevice.gatt.connected);
}

// Function to handle disconnection events
function onDisconnected() {
    console.log("Bluetooth device disconnected.");
    playDisconnectedSound();

    // Clean up resources
    if (bluetoothDevice) {
        bluetoothDevice.removeEventListener('gattserverdisconnected', onDisconnected);
    }
    // Clean up status characteristic notifications
    if (statusCharacteristic) {
        try {
            statusCharacteristic.removeEventListener('characteristicvaluechanged', onStatusNotification);
        } catch (e) { /* ignore */ }
    }
    bluetoothDevice = null;
    commandCharacteristic = null;
    statusCharacteristic = null;
    latestStatus = { sorterStatus: 'UNKNOWN', alcoholStatus: 'UNKNOWN', alcoholLevel: 0, bioTrash: 0, nonBioTrash: 0, eWasteTrash: 0 };

    // Notify the UI
    window.dispatchEvent(new CustomEvent('bt-disconnected'));
}

// Function to connect to the Bluetooth device
export async function connectToBluetoothDevice() {
    try {
        console.log("Requesting Bluetooth device...");

        // Scan for devices with the specified service
        // @ts-ignore
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [SORTER_SERVICE_UUID] }],
            optionalServices: [SORTER_SERVICE_UUID]
        });

        if (!device) {
            throw new Error("No device selected.");
        }
        bluetoothDevice = device;

        console.log("Connecting to GATT Server...");
        const server = await bluetoothDevice.gatt?.connect();

        if (!server) {
            throw new Error("Could not connect to GATT server.");
        }

        // Add event listener for disconnections
        bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

        console.log("Getting Sorter Service...");
        const service = await server.getPrimaryService(SORTER_SERVICE_UUID);

        console.log("Getting Command Characteristic...");
        const characteristic = await service.getCharacteristic(COMMAND_CHARACTERISTIC_UUID);
        commandCharacteristic = characteristic;

        // Subscribe to status notifications from ESP32
        try {
            console.log("Getting Status Characteristic...");
            const statusChar = await service.getCharacteristic(STATUS_CHARACTERISTIC_UUID);
            statusCharacteristic = statusChar;

            // Start listening for notifications
            statusChar.addEventListener('characteristicvaluechanged', onStatusNotification);
            await statusChar.startNotifications();
            console.log("Subscribed to status notifications.");

            // Do an initial read to get current status
            try {
                const initialValue = await statusChar.readValue();
                const decoder = new TextDecoder();
                const raw = decoder.decode(initialValue);
                console.log('Initial BLE Status:', raw);
                const parsed = parseStatusString(raw);
                latestStatus = { ...latestStatus, ...parsed };
                window.dispatchEvent(new CustomEvent('bt-status-update', { detail: { ...latestStatus } }));
            } catch (readErr) {
                console.warn('Could not read initial status:', readErr);
            }
        } catch (statusErr) {
            console.warn("Status characteristic not available (firmware may need update):", statusErr);
        }

        playConnectedSound();
        window.dispatchEvent(new CustomEvent('bt-connected'));
        console.log("Bluetooth device connected and ready.");

    } catch (error: any) {
        console.error("Bluetooth connection failed:", error);
        if (bluetoothDevice) {
            bluetoothDevice.removeEventListener('gattserverdisconnected', onDisconnected);
        }
        disconnectFromBluetoothDevice();
        throw error;
    }
}

// Function to disconnect from the Bluetooth device
export function disconnectFromBluetoothDevice() {
    if (!bluetoothDevice) {
        return;
    }
    if (bluetoothDevice.gatt?.connected) {
        console.log("Disconnecting from Bluetooth device...");
        bluetoothDevice.gatt.disconnect();
    } else {
        // If it's already disconnected but we're cleaning up
        console.log("Cleaning up disconnected bluetooth device.");
        onDisconnected();
    }
}

// Function to send a command to the ESP32
export async function sendCommand(command: string) {
    if (!isConnected() || !commandCharacteristic) {
        throw new Error("Not connected to a device.");
    }

    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(command);
        await commandCharacteristic.writeValue(data);
        console.log(`Sent command: ${command}`);
    } catch (error) {
        console.error(`Failed to send command "${command}":`, error);
        throw error;
    }
}
