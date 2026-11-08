export interface WorkflowStep<T> {
  name: string;
  run(ctx: T): Promise<T>;
}
export async function runWorkflow<T>(initial: T, steps: WorkflowStep<T>[]): Promise<T> {
  let ctx = initial;
  for (const step of steps) {
    ctx = await step.run(ctx);
  }
  return ctx;
}
