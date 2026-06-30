import { ref, readonly } from 'vue';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastTimer {
  duration: number;
  remainingMs: number;
  startedAt: number | null;
  timerId: ReturnType<typeof setTimeout> | null;
}

const toasts = ref<Toast[]>([]);
const toastTimers = new Map<number, ToastTimer>();
let nextId = 0;

const isPageHidden = () => typeof document !== 'undefined' && document.hidden;

const clearTimer = (timer: ToastTimer) => {
  if (timer.timerId !== null) {
    clearTimeout(timer.timerId);
    timer.timerId = null;
  }
};

const remove = (id: number) => {
  const timer = toastTimers.get(id);
  if (timer) {
    clearTimer(timer);
    toastTimers.delete(id);
  }

  const index = toasts.value.findIndex((t) => t.id === id);
  if (index !== -1) {
    toasts.value.splice(index, 1);
  }
};

const startTimer = (id: number) => {
  const timer = toastTimers.get(id);
  if (!timer || timer.timerId !== null || isPageHidden()) return;

  if (timer.remainingMs <= 0) {
    remove(id);
    return;
  }

  timer.startedAt = Date.now();
  timer.timerId = setTimeout(() => {
    remove(id);
  }, timer.remainingMs);
};

const pauseTimer = (id: number) => {
  const timer = toastTimers.get(id);
  if (!timer) return;

  if (timer.timerId !== null && timer.startedAt !== null) {
    timer.remainingMs = Math.max(0, timer.remainingMs - (Date.now() - timer.startedAt));
  }

  clearTimer(timer);
  timer.startedAt = null;
};

const pauseTimers = () => {
  for (const id of toastTimers.keys()) {
    pauseTimer(id);
  }
};

const resumeTimers = () => {
  for (const id of toastTimers.keys()) {
    startTimer(id);
  }
};

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseTimers();
    } else {
      resumeTimers();
    }
  });
}

const add = (message: string, type: ToastType = 'info', duration = 3000) => {
  const id = nextId++;
  const toast: Toast = { id, message, type };
  toasts.value.push(toast);

  if (duration > 0) {
    toastTimers.set(id, {
      duration,
      remainingMs: duration,
      startedAt: null,
      timerId: null,
    });
    startTimer(id);
  }
};

export function useToast() {
  const success = (message: string, duration?: number) => add(message, 'success', duration);
  const error = (message: string, duration?: number) => add(message, 'error', duration);
  const warning = (message: string, duration?: number) => add(message, 'warning', duration);
  const info = (message: string, duration?: number) => add(message, 'info', duration);

  return {
    toasts: readonly(toasts),
    add,
    remove,
    success,
    error,
    warning,
    info,
  };
}
