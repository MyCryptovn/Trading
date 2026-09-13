export function log(message) {
  const time =
    new Date().toISOString();

  console.log(
    `[${time}] ${message}`
  );
}

export function logError(error) {
  const time =
    new Date().toISOString();

  console.error(
    `[${time}] ERROR: ${error.message}`
  );
}
