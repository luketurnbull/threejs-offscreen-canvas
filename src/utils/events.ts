type Callback<T> = (payload: T) => void;

export default class EventEmitter<TEvents extends object> {
  private listeners = new Map<keyof TEvents, Set<Callback<unknown>>>();

  on<K extends keyof TEvents>(
    event: K,
    callback: Callback<TEvents[K]>,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners?.get(event)?.add(callback as Callback<unknown>);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  off<K extends keyof TEvents>(
    event: K,
    callback?: Callback<TEvents[K]>,
  ): void {
    if (!callback) {
      this.listeners.delete(event);
    } else {
      this.listeners.get(event)?.delete(callback as Callback<unknown>);
    }
  }

  protected emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    this.listeners.get(event)?.forEach((cb) => {
      cb(payload);
    });
  }
}
