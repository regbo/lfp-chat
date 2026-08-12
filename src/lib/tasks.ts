/** Provider-neutral task shape consumed by the UI and agent tools. */
export type Task = {
  id: number;
  title: string;
  description?: string;
  done: boolean;
  due_date?: string;
  priority?: number;
  assignees?: Array<{
    id: number;
    username: string;
    name?: string;
    email?: string;
  }>;
  created?: string;
  updated?: string;
};
