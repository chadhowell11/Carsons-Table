// Password sign-in against the auth service's REST API (what supabase-js does
// under the hood), so tests don't import the client library.
export async function signIn(url, anonKey, email, password) {
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anonKey, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`sign-in failed for ${email}: ${r.status} ${JSON.stringify(body)}`);
  return body.access_token;
}
