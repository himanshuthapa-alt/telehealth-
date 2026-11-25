import { createAudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

export async function playBase64Audio(audioBase64: string, _contentType: string): Promise<void> {
  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) throw new Error('Audio cache is unavailable.');
  const uri = `${cacheDirectory}telecare-voice-${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(uri, audioBase64, { encoding: FileSystem.EncodingType.Base64 });
  const player = createAudioPlayer(uri);

  await new Promise<void>((resolve, reject) => {
    let complete = false;
    let subscription: ReturnType<typeof player.addListener> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (error?: Error) => {
      if (complete) return;
      complete = true;
      if (timer) clearTimeout(timer);
      subscription?.remove();
      player.remove();
      void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      if (error) reject(error);
      else resolve();
    };
    timer = setTimeout(() => finish(new Error('Spoken reply timed out.')), 45_000);
    subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.error) finish(new Error(status.error));
      else if (status.didJustFinish) finish();
    });
    try {
      player.play();
    } catch (error) {
      finish(error instanceof Error ? error : new Error('Spoken reply could not be played.'));
    }
  });
}
