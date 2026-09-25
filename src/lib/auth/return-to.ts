export function invitationReturnTo(value: string | string[] | undefined) {
  const path = Array.isArray(value) ? value[0] : value;
  return path && /^\/invitacion\/[A-Za-z0-9_-]{43}$/.test(path) ? path : undefined;
}
