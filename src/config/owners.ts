// Store owner logins. These Google accounts always get SUPER_ADMIN, but only when the
// email is verified (Google sign-in, or an email/password account that clicked the
// verification link), so nobody can claim them by registering the address first.
// Firestore rules repeat this list in isSuperAdmin(); keep both in sync.
export const BUILT_IN_OWNER_EMAILS = ['specialforme683@gmail.com'];

export function isBuiltInOwnerEmail(email: string | null | undefined): boolean {
  return BUILT_IN_OWNER_EMAILS.includes(String(email || '').trim().toLowerCase());
}
