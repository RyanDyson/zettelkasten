export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-HK", {
    dateStyle: "medium",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(value));
}
export function formatSeconds(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
