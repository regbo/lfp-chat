/** Provider-neutral list shape consumed by the UI and agent tools. */
export type TaskList = {
  id: number;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TaskLink = {
  label: string;
  url: string;
};

/** Provider-neutral task shape consumed by the UI and agent tools. */
export type Task = {
  id: number;
  listId: number;
  title: string;
  description?: string;
  done: boolean;
  dueDate?: string;
  priority?: number;
  links?: TaskLink[];
  createdAt?: string;
  updatedAt?: string;
};
