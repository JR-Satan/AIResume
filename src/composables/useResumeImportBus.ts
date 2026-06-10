import { ref } from 'vue';
import type {
  ImportResult,
  ResumeImportEvent,
  ResumeImportEventType,
} from '../types/resumeImport';

type Handler = (event: ResumeImportEvent) => void;

const listeners = new Map<ResumeImportEventType | '*', Set<Handler>>();

export const importWarnings = ref<ImportResult['warnings']>([]);

function emit(event: ResumeImportEvent) {
  listeners.get(event.type)?.forEach(handler => handler(event));
  listeners.get('*')?.forEach(handler => handler(event));

  if (event.type === 'IMPORT_CONFIRMED') {
    importWarnings.value = event.result.warnings ?? [];
  }
}

export function useResumeImportBus() {
  return {
    emit,
    on(type: ResumeImportEventType | '*', handler: Handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler);
      return () => listeners.get(type)?.delete(handler);
    },
  };
}

export { emit as emitResumeImportEvent };
