

// UUIDs for the Bluetooth service and characteristic
// These MUST match the UUIDs programmed into your ESP32 Arduino sketch
const SORTER_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const COMMAND_CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const STATUS_CHARACTERISTIC_UUID = "f2ba755b-b92e-4638-9a39-42b477651a54";

let bluetoothDevice: BluetoothDevice | null = null;
let gattServer: BluetoothRemoteGATTServer | null = null;
export let commandCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
let statusCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

// Command Queue
const commandQueue: string[] = [];
let isProcessingQueue = false;

// Function to process the command queue
async function processCommandQueue() {
    if (isProcessingQueue || commandQueue.length === 0) {
        return;
    }

    isProcessingQueue = true;
    const command = commandQueue.shift();

    if (command && commandCharacteristic) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(command);
            await commandCharacteristic.writeValue(data);
            console.log(`Sent command: ${command}`);
        } catch (error) {
            console.error(`Failed to send command "${command}":`, error);
            // Optionally, re-queue the command or handle the error
        }
    }
    
    // Use a short delay before processing the next command to prevent overwhelming the device
    setTimeout(() => {
        isProcessingQueue = false;
        processCommandQueue();
    }, 100);
}

export function isConnected(): boolean {
    return !!(bluetoothDevice && bluetoothDevice.gatt && bluetoothDevice.gatt.connected);
}

// Function to connect to the Bluetooth device
export async function connectToBluetoothDevice() {
    try {
        console.log("Requesting Bluetooth device...");
        
        // Scan for devices with the specified service
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [{ services: [SORTER_SERVICE_UUID] }],
            optionalServices: [SORTER_SERVICE_UUID]
        });

        if (!bluetoothDevice) {
            throw new Error("No device selected.");
        }

        console.log("Connecting to GATT Server...");
        gattServer = await bluetoothDevice.gatt?.connect();

        if (!gattServer) {
            throw new Error("Could not connect to GATT server.");
        }
        
        // Add event listener for disconnections
        bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

        console.log("Getting Sorter Service...");
        const service = await gattServer.getPrimaryService(SORTER_SERVICE_UUID);

        console.log("Getting Command Characteristic...");
        commandCharacteristic = await service.getCharacteristic(COMMAND_CHARACTERISTIC_UUID);

        console.log("Getting Status Characteristic...");
        statusCharacteristic = await service.getCharacteristic(STATUS_CHARACTERISTIC_UUID);
        
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

// Function to handle disconnection events
function onDisconnected() {
    console.log("Bluetooth device disconnected.");
    
    // Clean up resources
    if (bluetoothDevice) {
        bluetoothDevice.removeEventListener('gattserverdisconnected', onDisconnected);
    }
    bluetoothDevice = null;
    gattServer = null;
    commandCharacteristic = null;
    statusCharacteristic = null;
    commandQueue.length = 0; // Clear the queue on disconnect
    isProcessingQueue = false;
    
    // Notify the UI
    window.dispatchEvent(new CustomEvent('bt-disconnected'));
}

// Function to disconnect from the Bluetooth device
export function disconnectFromBluetoothDevice() {
    if (!bluetoothDevice || !bluetoothDevice.gatt) {
        return;
    }
    if (bluetoothDevice.gatt.connected) {
        console.log("Disconnecting from Bluetooth device...");
        bluetoothDevice.gatt.disconnect();
    } else {
        // If it's already disconnected but we're cleaning up
        onDisconnected();
    }
}

// Function to send a command to the ESP32 by adding it to the queue
export async function sendCommand(command: string) {
    if (!isConnected()) {
        throw new Error("Not connected to a device.");
    }
    commandQueue.push(command);
    processCommandQueue();
}

// Function to subscribe to notifications from the ESP32
export async function subscribeToNotifications(logCallback: (message: string) => void) {
    if (!statusCharacteristic) {
        throw new Error("Status characteristic not found.");
    }

    await statusCharacteristic.startNotifications();
    console.log("Subscribed to status notifications.");

    statusCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
        const target = event.target as BluetoothRemoteGATTCharacteristic;
        const value = target.value;
        if (value) {
            const decoder = new TextDecoder('utf-8');
            const message = decoder.decode(value);
            logCallback(`Sorter Status: ${message}`);
            
            // If the sorter becomes ready, we can potentially trigger a camera restart
            if (message === 'READY') {
                 window.dispatchEvent(new CustomEvent('sorter-ready'));
            }
        }
    });
}
