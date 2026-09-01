// §52: financial tracking must fail safely — a write that hangs forever
// with a disabled button and no feedback is worse than one that fails
// outright, since the user has no way to know or retry. Every user-facing
// Firestore write in the app is wrapped in this so a stuck connection
// surfaces as an explicit error within a bounded time instead of an
// indefinite spinner.
export function withTimeout(promise, ms = 10000, message = 'This is taking too long. Check your connection and try again.') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
