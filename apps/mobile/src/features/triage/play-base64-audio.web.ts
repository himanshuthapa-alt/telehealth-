export async function playBase64Audio(audioBase64: string, contentType: string): Promise<void> {
  const audio = new Audio(`data:${contentType};base64,${audioBase64}`);
  try {
    const ended = new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error('Spoken reply could not be played.'));
    });
    await audio.play();
    await ended;
  } finally {
    audio.pause();
    audio.src = '';
  }
}
