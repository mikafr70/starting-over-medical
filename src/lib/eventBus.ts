// Simple event bus for cross-component notifications
const bus = new EventTarget();

export function emitEvent(name: string, detail: any = null) {
  try {
    bus.dispatchEvent(new CustomEvent(name, { detail }));
  } catch (err) {
    // ignore
  }
}

export function onEvent(name: string, handler: (e: CustomEvent) => void) {
  const wrapped = (ev: Event) => handler(ev as CustomEvent);
  bus.addEventListener(name, wrapped as EventListener);
  return () => bus.removeEventListener(name, wrapped as EventListener);
}

export default bus;
