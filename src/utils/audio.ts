let saleAudio: HTMLAudioElement | null = null;

function getSaleAudio() {
  if (!saleAudio) {
    saleAudio = new Audio("/sounds/cashRegister.mp3");
    saleAudio.preload = "auto";
    saleAudio.volume = 0.4;
  }
  return saleAudio;
}

export async function prepareSaleSound() {
  try {
    const audio = getSaleAudio();
    audio.muted = true;
    audio.currentTime = 0;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
  } catch (error) {
    console.error("Failed preparing sale sound", error);
  }
}

export function playSaleSound() {
  try {
    const audio = getSaleAudio();
    audio.muted = false;
    audio.currentTime = 0;
    void audio.play().catch((error) => {
      console.error("Failed playing sale sound", error);
    });
  } catch (error) {
    console.error("Failed playing sale sound", error);
  }
}
