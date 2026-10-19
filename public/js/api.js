let onAuthLost = () => {};
export const setAuthLostHandler = (fn) => { onAuthLost = fn; };

export async function api(method, path, body) {
  let r;
  try {
    r = await fetch('/api' + path, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch {
    const e = new Error('No connection. Check your data or Wi-Fi and try again.'); e.code = 'offline'; throw e;
  }
  let j = null;
  try { j = await r.json(); } catch { /* no body */ }
  if (!r.ok) {
    const e = new Error(j?.error?.message || 'Something went wrong. Please try again.');
    e.status = r.status; e.code = j?.error?.code; e.field = j?.error?.field;
    if (r.status === 401 && !path.startsWith('/auth/')) onAuthLost();
    throw e;
  }
  return j;
}
export const get = (p) => api('GET', p);
export const post = (p, b) => api('POST', p, b ?? {});
export const patch = (p, b) => api('PATCH', p, b);
export const put = (p, b) => api('PUT', p, b);
export const del = (p, b) => api('DELETE', p, b);

export async function uploadPdf(file) {
  let r;
  try { r = await fetch('/api/files', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/pdf', 'x-filename': file.name }, body: file }); }
  catch { throw new Error('No connection. Try again.'); }
  let j = null; try { j = await r.json(); } catch { /* none */ }
  if (!r.ok) throw new Error(r.status === 413 ? 'That PDF is too big. The limit is 3 MB.' : j?.error?.message || 'Upload failed.');
  return j;
}
