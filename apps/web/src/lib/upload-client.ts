/** Envoi d'un fichier M3U (côté navigateur), compressé en gzip quand c'est possible. */
export async function uploadPlaylistFile(playlistId: string, file: File): Promise<void> {
  let body: Blob = file;
  let gz = false;
  if (typeof CompressionStream !== 'undefined') {
    body = await new Response(file.stream().pipeThrough(new CompressionStream('gzip'))).blob();
    gz = true;
  }
  const res = await fetch(`/api/playlists/${playlistId}/file`, {
    method: 'POST',
    body,
    headers: { 'x-gzip': gz ? '1' : '0', 'x-file-name': encodeURIComponent(file.name) },
  });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(d.message || 'Envoi impossible (HTTP ' + res.status + ').');
  }
}
