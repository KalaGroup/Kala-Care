// ============================================================================
// Background upload tracker
// ----------------------------------------------------------------------------
// An upload is a plain fetch, so it keeps running when the page that started it
// unmounts — navigating away never cancels it, and the success / failure toast
// still fires because the Toaster lives at the app root. What was missing was
// any SIGN of that: this tiny store lets a job announce itself so the app can
// show a banner from the root, warn when the user changes page mid-upload, and
// stop the tab being closed or reloaded (which really would kill the request).
//
// Deliberately framework-free: any module can call startUpload / finishUpload
// without holding a React ref to the component that began the work.
// ============================================================================
import { useSyncExternalStore } from 'react';

let jobs = [];                  // [{ id, label }] — reference is stable between emits
let seq = 0;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

/** Register a running upload. Returns the id to hand back to finishUpload(). */
export const startUpload = (label) => {
    const id = ++seq;
    jobs = [...jobs, { id, label: label || 'Upload' }];
    emit();
    return id;
};

/** Clear a finished / failed upload. Safe to call twice. */
export const finishUpload = (id) => {
    if (!jobs.some((j) => j.id === id)) return;
    jobs = jobs.filter((j) => j.id !== id);
    emit();
};

const getSnapshot = () => jobs;
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Live list of running uploads. */
export const useUploads = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
