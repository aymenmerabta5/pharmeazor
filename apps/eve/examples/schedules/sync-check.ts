import { defineSchedule } from "eve/schedules";
export default defineSchedule({
  cron: "0 * * * *",
  markdown: "Run ghostinit sync --check in parent project root and report drift.",
});
