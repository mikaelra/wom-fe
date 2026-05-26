// Use env in production; default to local backend for dev
export const BACKEND_URL =
  typeof process.env.NEXT_PUBLIC_BACKEND_URL === "string" &&
  process.env.NEXT_PUBLIC_BACKEND_URL.length > 0
    ? process.env.NEXT_PUBLIC_BACKEND_URL
    : "https://wom-be-test.onrender.com";
