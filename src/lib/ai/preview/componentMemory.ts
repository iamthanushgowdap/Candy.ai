import { VirtualProject } from "./virtualFs";

const STORAGE_PREFIX = "antgravity_vfs_project_";

/**
 * Stores the virtual project state for a chat session in local storage for persistence across reloads.
 */
export function saveProjectState(sessionId: string, project: VirtualProject): void {
  if (typeof window === "undefined" || !sessionId) return;
  try {
    const data = JSON.stringify(project);
    window.localStorage.setItem(`${STORAGE_PREFIX}${sessionId}`, data);
  } catch (e) {
    console.error("Failed to persist VFS project state to localStorage:", e);
  }
}

/**
 * Loads a persisted virtual project state for a given chat session.
 */
export function loadProjectState(sessionId: string): VirtualProject | null {
  if (typeof window === "undefined" || !sessionId) return null;
  try {
    const data = window.localStorage.getItem(`${STORAGE_PREFIX}${sessionId}`);
    if (data) {
      return JSON.parse(data) as VirtualProject;
    }
  } catch (e) {
    console.error("Failed to load VFS project state from localStorage:", e);
  }
  return null;
}

/**
 * Clears the persisted virtual project state for a chat session.
 */
export function clearProjectState(sessionId: string): void {
  if (typeof window === "undefined" || !sessionId) return;
  try {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${sessionId}`);
  } catch (e) {
    console.error("Failed to clear VFS project state:", e);
  }
}
