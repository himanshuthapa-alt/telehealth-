export async function deleteRecording(uri: string): Promise<void> {
  if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
}
