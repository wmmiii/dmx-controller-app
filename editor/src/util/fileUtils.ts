export function escapeForFilesystem(name: string) {
  return name
    .toLocaleLowerCase()
    .replace(' ', '_')
    .replace(/[^\w_-]/g, '');
}
