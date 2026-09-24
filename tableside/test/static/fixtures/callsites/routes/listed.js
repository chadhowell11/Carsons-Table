// Positive control for guard 2: two uses, one documented, one without the marker.
export async function a(req) {
  // authorize-then-write
  await req.tenant.adminClient.from('x').insert({});
  await req.tenant.adminClient.from('x').delete();
}
