
let audioContext: AudioContext | null = null;
const audioBufferCache: {[key: string]: AudioBuffer} = {};

function getAudioContext() {
  if (!audioContext) {
    // Standard AudioContext
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

async function playSound(url: string) {
  try {
    const context = getAudioContext();
    
    // Resume context on user gesture if it's suspended
    if (context.state === 'suspended') {
      await context.resume();
    }

    let buffer: AudioBuffer;

    if (audioBufferCache[url]) {
      // Use cached buffer
      buffer = audioBufferCache[url];
    } else {
      // Fetch and decode the audio file
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio file: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      buffer = await context.decodeAudioData(arrayBuffer);
      // Cache the decoded audio data
      audioBufferCache[url] = buffer;
    }

    // Create a source node
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    
    // Play the sound
    source.start(0);

  } catch (error) {
    console.error(`Error playing sound ${url}:`, error);
  }
}


export function playConnectedSound() {
  playSound('/sounds/connect.mp3');
}

export function playDisconnectedSound() {
  playSound('/sounds/disconnect.mp3');
}
