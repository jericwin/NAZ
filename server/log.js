// Structured, privacy-aware logging. Never pass names, addresses or full phone numbers here;
// use maskPhone() for anything that has to identify a customer in the logs.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

export function createLogger(level = "info") {
  const min = LEVELS[level] ?? LEVELS.info;
  const write = (lvl, msg, fields) => {
    if (LEVELS[lvl] < min) return;
    const line = JSON.stringify({ t: new Date().toISOString(), level: lvl, msg, ...fields });
    (lvl === "error" || lvl === "warn" ? process.stderr : process.stdout).write(line + "\n");
  };
  return {
    debug: (msg, fields) => write("debug", msg, fields),
    info: (msg, fields) => write("info", msg, fields),
    warn: (msg, fields) => write("warn", msg, fields),
    error: (msg, fields) => write("error", msg, fields)
  };
}

export const maskPhone = phone => (phone ? "•••" + String(phone).slice(-3) : "");

export const errorMessage = error => (error && error.message ? error.message : String(error));
