export function escapeForFilesystem(name: string) {
  return name
    .toLocaleLowerCase()
    .replace(' ', '_')
    .replace(/[^\w_-]/g, '');
}

export function downloadBlob(blob: Blob, name: string) {
  let url = '';
  try {
    url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
