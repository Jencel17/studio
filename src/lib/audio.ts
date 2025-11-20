
let audioContext: AudioContext | null = null;
const audioBufferCache: {[key: string]: AudioBuffer} = {};

// Initialize AudioContext on user interaction.
// Browsers require a user gesture to start the audio context.
const initializeAudioContext = () => {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.error("Web Audio API is not supported in this browser");
    }
  }
  // If it's suspended, try to resume it on any user interaction.
  if (audioContext?.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

// Add a listener for the first user interaction
if (typeof window !== 'undefined') {
    const initAudio = () => {
        initializeAudioContext();
        document.removeEventListener('click', initAudio);
        document.removeEventListener('touchstart', initAudio);
        document.removeEventListener('keydown', initAudio);
    };
    document.addEventListener('click', initAudio);
    document.addEventListener('touchstart', initAudio);
    document.addEventListener('keydown', initAudio);
}


async function playSound(url: string) {
  const context = initializeAudioContext();
  if (!context) {
    console.error("AudioContext is not available.");
    return;
  }
  
  try {
    // Always try to resume context on play, as it might get suspended.
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
  playSound('/connect.mp3');
}

export function playDisconnectedSound() {
  playSound('/disconnect.mp3');
}
