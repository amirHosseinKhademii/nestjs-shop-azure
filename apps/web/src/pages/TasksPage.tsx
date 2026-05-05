import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { TASKS } from '../graphql/queries';
import { CREATE_TASK, DELETE_TASK, UPDATE_TASK } from '../graphql/mutations';
import {
  TaskPriority,
  TaskStatus,
  type CreateTaskInputGql,
  type DeleteTaskMutation,
  type TasksQuery,
  type UpdateTaskInputGql,
} from '../__generated__/graphql';
import { Spinner } from '../components/Spinner';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';

type Task = NonNullable<TasksQuery['tasks']>['items'][number];

const statusBadge: Record<TaskStatus, string> = {
  Todo: 'badge--muted',
  InProgress: 'badge--warn',
  Done: 'badge--ok',
};

const priorityBadge: Record<TaskPriority, string> = {
  Low: 'badge--muted',
  Medium: 'badge--warn',
  High: 'badge--danger',
};

function formatWhen(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
}

export function TasksPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [q, setQ] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const variables = useMemo(
    () => ({
      page,
      pageSize,
      status: status || undefined,
      priority: priority || undefined,
      q: q.trim() || undefined,
    }),
    [page, pageSize, status, priority, q],
  );

  const { data, loading, error, refetch } = useQuery(TASKS, { variables });
  const [createTask, { loading: creating }] = useMutation(CREATE_TASK);
  const [updateTask, { loading: updating }] = useMutation(UPDATE_TASK);
  const [deleteTask, { loading: deleting }] = useMutation(DELETE_TASK);

  if (loading) return <Spinner label="Loading tasks" />;
  if (error) {
    return (
      <div className="card card--error" role="alert">
        Could not load tasks: {error.message}
      </div>
    );
  }

  const pageData = data?.tasks;
  const items = pageData?.items ?? [];
  const totalItems = pageData?.totalItems ?? 0;
  const totalPages = pageData?.totalPages ?? 0;

  const onResetFilters = () => {
    setPage(1);
    setPageSize(20);
    setStatus('');
    setPriority('');
    setQ('');
  };

  const onSubmitCreate = async (input: CreateTaskInputGql) => {
    await createTask({ variables: { input } });
    setCreateOpen(false);
    await refetch(variables);
  };

  const onSubmitUpdate = async (id: string, input: UpdateTaskInputGql) => {
    await updateTask({ variables: { id, input } });
    setEditing(null);
    await refetch(variables);
  };

  const onDelete = async (id: string) => {
    const ok = window.confirm('Delete this task?');
    if (!ok) return;
    const res = await deleteTask({ variables: { id } });
    const deleted = (res.data as DeleteTaskMutation | undefined)?.deleteTask ?? false;
    if (!deleted) return;
    await refetch(variables);
  };

  return (
    <section aria-labelledby="tasks-heading">
      <header className="page-header">
        <div>
          <h2 id="tasks-heading">Tasks</h2>
          <p className="muted">
            {totalItems} total · page {page} / {Math.max(1, totalPages)}
          </p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn--ghost" onClick={onResetFilters}>
            Reset
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setCreateOpen(true)}>
            New task
          </button>
        </div>
      </header>

      <div className="card task-filters" role="search" aria-label="Task filters">
        <div className="field-row">
          <label className="field">
            <span>Search</span>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Title or description…"
            />
          </label>

          <label className="field">
            <span>Status</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as TaskStatus | '');
                setPage(1);
              }}
            >
              <option value="">Any</option>
              <option value="Todo">Todo</option>
              <option value="InProgress">In progress</option>
              <option value="Done">Done</option>
            </select>
          </label>

          <label className="field">
            <span>Priority</span>
            <select
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value as TaskPriority | '');
                setPage(1);
              }}
            >
              <option value="">Any</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </label>

          <label className="field">
            <span>Page size</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </label>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No tasks"
          description="Create your first task to get started."
          action={
            <button type="button" className="btn btn--primary" onClick={() => setCreateOpen(true)}>
              New task
            </button>
          }
        />
      ) : (
        <>
          <ul className="task-list" aria-label="Tasks">
            {items.map((t) => (
              <li key={t.id} className="card task-row">
                <div className="task-row__main">
                  <div className="task-row__title">
                    <strong>{t.title}</strong>
                    {t.dueDate && <span className="muted small">Due {formatWhen(t.dueDate)}</span>}
                  </div>
                  {t.description && <p className="muted task-row__desc">{t.description}</p>}
                </div>

                <div className="task-row__meta">
                  <span className={`badge ${statusBadge[t.status]}`}>{t.status}</span>
                  <span className={`badge ${priorityBadge[t.priority]}`}>{t.priority}</span>
                </div>

                <div className="task-row__actions">
                  <button type="button" className="btn btn--ghost" onClick={() => setEditing(t)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => onDelete(t.id)}
                    disabled={deleting}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="pager" aria-label="Pagination">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              ← Prev
            </button>
            <span className="muted small">
              Page {page} of {Math.max(1, totalPages)}
            </span>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setPage((p) => (totalPages ? Math.min(totalPages, p + 1) : p + 1))}
              disabled={Boolean(totalPages) && page >= totalPages}
            >
              Next →
            </button>
          </div>
        </>
      )}

      <TaskModal
        mode="create"
        open={createOpen}
        title="New task"
        submitting={creating}
        initial={{
          title: '',
          description: '',
          status: TaskStatus.Todo,
          priority: TaskPriority.Medium,
          dueDate: '',
        }}
        onClose={() => setCreateOpen(false)}
        onSubmit={(v) =>
          onSubmitCreate({
            title: v.title,
            description: v.description?.trim() ? v.description.trim() : undefined,
            status: v.status as TaskStatus,
            priority: v.priority as TaskPriority,
            dueDate: v.dueDate?.trim() ? new Date(v.dueDate).toISOString() : undefined,
          })
        }
      />

      <TaskModal
        mode="edit"
        open={Boolean(editing)}
        title="Edit task"
        submitting={updating}
        initial={{
          title: editing?.title ?? '',
          description: editing?.description ?? '',
          status: editing?.status ?? TaskStatus.Todo,
          priority: editing?.priority ?? TaskPriority.Medium,
          dueDate: editing?.dueDate ? editing.dueDate.slice(0, 10) : '',
        }}
        onClose={() => setEditing(null)}
        onSubmit={(v) => {
          if (!editing) return;
          return onSubmitUpdate(editing.id, {
            title: v.title,
            status: v.status as TaskStatus,
            priority: v.priority as TaskPriority,
            description: v.description?.trim() ? v.description.trim() : undefined,
            dueDate: v.dueDate?.trim() ? new Date(v.dueDate).toISOString() : undefined,
          });
        }}
      />
    </section>
  );
}

type TaskFormState = {
  title: string;
  description: string;
  status: TaskStatus | '';
  priority: TaskPriority | '';
  dueDate: string; // yyyy-mm-dd
};

function TaskModal(props: {
  mode: 'create' | 'edit';
  open: boolean;
  title: string;
  submitting: boolean;
  initial: TaskFormState;
  onClose: () => void;
  onSubmit: (v: TaskFormState) => void | Promise<void>;
}) {
  const { open, onClose, title, submitting, initial, onSubmit } = props;
  const [state, setState] = useState<TaskFormState>(initial);

  // Keep the modal form in sync when switching between tasks.
  useEffect(() => {
    if (!open) return;
    if (submitting) return;
    setState(initial);
  }, [open, submitting, initial]);

  const canSubmit = state.title.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => onSubmit({ ...state, title: state.title.trim() })}
            disabled={!canSubmit || submitting}
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="field">
        <span>Title</span>
        <input
          value={state.title}
          onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
          placeholder="e.g. Follow up with supplier"
        />
      </div>

      <div className="field">
        <span>Description</span>
        <textarea
          value={state.description}
          onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
          placeholder="Optional notes…"
        />
      </div>

      <div className="field-row">
        <label className="field">
          <span>Status</span>
          <select
            value={state.status}
            onChange={(e) => setState((s) => ({ ...s, status: e.target.value as TaskStatus }))}
          >
            <option value={TaskStatus.Todo}>Todo</option>
            <option value={TaskStatus.InProgress}>In progress</option>
            <option value={TaskStatus.Done}>Done</option>
          </select>
        </label>

        <label className="field">
          <span>Priority</span>
          <select
            value={state.priority}
            onChange={(e) => setState((s) => ({ ...s, priority: e.target.value as TaskPriority }))}
          >
            <option value={TaskPriority.Low}>Low</option>
            <option value={TaskPriority.Medium}>Medium</option>
            <option value={TaskPriority.High}>High</option>
          </select>
        </label>
      </div>

      <label className="field">
        <span>Due date</span>
        <input
          type="date"
          value={state.dueDate}
          onChange={(e) => setState((s) => ({ ...s, dueDate: e.target.value }))}
        />
      </label>
    </Modal>
  );
}
