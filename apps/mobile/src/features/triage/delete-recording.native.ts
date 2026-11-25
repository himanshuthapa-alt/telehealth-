import * as FileSystem from 'expo-file-system/legacy';

export async function deleteRecording(uri: string): Promise<void> {
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}
