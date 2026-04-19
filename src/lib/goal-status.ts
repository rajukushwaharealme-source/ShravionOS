export type GoalStatus = 'pending' | 'in-progress' | 'completed' | 'missed';

const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getGoalDisplayStatus = (goal: any, now: Date = new Date()): GoalStatus => {
  if (goal.status === 'completed') return 'completed';

  const startDate = toDate(goal.startDate);
  const deadline = toDate(goal.deadline);

  if (!startDate && !deadline) return 'pending';
  if (deadline && now.getTime() > deadline.getTime()) return 'missed';
  if (!startDate) return 'pending';
  if (startDate && now.getTime() < startDate.getTime()) return 'pending';

  return 'in-progress';
};

export const withGoalDisplayStatus = <T extends { status?: string }>(goal: T, now: Date = new Date()) => ({
  ...goal,
  status: getGoalDisplayStatus(goal, now)
});
