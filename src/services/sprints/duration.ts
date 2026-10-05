import { addDays } from "@/services/views/calendar";

export const SPRINT_WEEKS = [1, 2] as const;

// end_date is the sprint's last day, inclusive: the timeline spans start..end
// and daysLeft reaches 0 on it, so a one-week sprint ends six days after it starts.
export function sprintEnd(start: string, weeks: number): string {
  return addDays(start, weeks * 7 - 1);
}
