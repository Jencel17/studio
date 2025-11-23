
import { playConnectedSound, playDisconnectedSound } from './audio';

// UUIDs for the Bluetooth service and characteristic
// These MUST match the UUIDs programmed into your ESP32 Arduino sketch
const SORTER_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const COMMAND_CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

let bluetoothDevice: any | null = null;
let commandCharacteristic: any | null = null;

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
    bluetoothDevice = null;
    commandCharacteristic = null;

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
