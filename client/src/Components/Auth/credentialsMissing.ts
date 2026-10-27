/* Names whichever of the two fields is empty, so a blank form is told what to fill in rather than that it is wrong */
export const credentialsMissing = (email: string, password: string): string | null => {
  const noEmail = email.trim() === '';
  const noPassword = password === '';
  if (noEmail && noPassword) return 'Please enter your email and password.';
  if (noEmail) return 'Please enter your email.';
  if (noPassword) return 'Please enter your password.';
  return null;
};