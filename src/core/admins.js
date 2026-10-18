// Cosmetic only: it shows or hides the admin tabs and pages. firestore.rules'
// isAdmin() is the real gate, so keep the two lists in step.
export const ADMIN_EMAILS = ["hajunk105@gmail.com", "hjkim29@kis.ac"];

export function isAdminEmail(email) {
  return Boolean(email) && ADMIN_EMAILS.includes(email);
}
