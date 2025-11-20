
let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

async function playSound(url: string) {
  try {
    const context = getAudioContext();
    // Resume context on user gesture
    if (context.state === 'suspended') {
      await context.resume();
    }
    
    const audio = new Audio(url);
    await audio.play();

  } catch (error) {
    console.error(`Error playing sound ${url}:`, error);
  }
}

export function playConnectedSound() {
  // A real MP3 file will be created at this path.
  // The placeholder in the file system is just for generation purposes.
  playSound('/sounds/connect.mp3');
}

export function playDisconnectedSound() {
  // A real MP3 file will be created at this path.
  // The placeholder in the file system is just for generation purposes.
  playSound('/sounds/disconnect.mp3');
}
