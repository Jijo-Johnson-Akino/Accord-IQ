const KEY = "accordiq.sidebarCollapsed";

const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
}

export function subscribeSidebarCollapsed(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function getSidebarCollapsed(): boolean {
  return read();
}

export function getSidebarCollapsedServer(): boolean {
  return false;
}

export function setSidebarCollapsed(next: boolean): void {
  window.localStorage.setItem(KEY, String(next));
  listeners.forEach((listener) => listener());
}
