
let audioContext: AudioContext | null = null;
const audioBufferCache: {[key: string]: AudioBuffer} = {};

// Initialize AudioContext on user interaction.
// Browsers require a user gesture to start the audio context.
const initializeAudioContext = () => {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.error("Web Audio API is not supported in this browser");
    }
  }
  return audioContext;
}

// Add a listener for the first user interaction
if (typeof window !== 'undefined') {
  document.addEventListener('click', initializeAudioContext, { once: true });
  document.addEventListener('touchstart', initializeAudioContext, { once: true });
}


async function playSound(url: string) {
  const context = initializeAudioContext();
  if (!context) {
    console.error("AudioContext is not available.");
    return;
  }
  
  try {
    // Resume context on user gesture if it's suspended.
    if (context.state === 'suspended') {
      await context.resume();
    }

    let buffer: AudioBuffer;

    if (audioBufferCache[url]) {
      buffer = audioBufferCache[url];
    } else {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio file: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      buffer = await context.decodeAudioData(arrayBuffer);
      audioBufferCache[url] = buffer;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    
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
