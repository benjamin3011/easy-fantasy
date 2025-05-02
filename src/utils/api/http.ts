/* ------------------------------------------------------------------
 *  Central Axios instance
 * ------------------------------------------------------------------ */
import axios from "axios";

/**
 * Vite →   import.meta.env.VITE_FN_BASE
 *
 * Provide the variable in an `.env` file or via the shell, e.g.
 *   VITE_FN_BASE=http://localhost:5001/easy-fantasy/europe-west3   (emulator)
 *   VITE_FN_BASE=https://europe-west3-easy-fantasy.cloudfunctions.net (prod)
 */
const baseURL = import.meta.env.VITE_FN_BASE ?? "/api";

export const http = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});
