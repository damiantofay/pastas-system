// Cliente de la API. Todo pasa por /api.
async function req(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await r.json(); } catch (_) {}
  if (r.status === 401) {
    // Sesión vencida o inexistente: al login (salvo que ya estemos ahí)
    if (!location.pathname.endsWith('/login.html')) location.href = '/login.html';
    throw new Error(data.error || 'Sesión vencida');
  }
  if (!r.ok) throw new Error(data.error || 'No se pudo completar la acción');
  return data;
}

const API = {
  get: (u) => req('GET', u),
  post: (u, b) => req('POST', u, b),
  put: (u, b) => req('PUT', u, b),
  del: (u) => req('DELETE', u)
};
export default API;
