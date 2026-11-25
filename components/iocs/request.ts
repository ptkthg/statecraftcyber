type Handlers<T> = { success: (data: T) => void; error: () => void; settled: () => void };

/** Cancels obsolete requests and guards callbacks even when a transport ignores abort. */
export class LatestIocRequest {
  private controller?: AbortController;
  private sequence = 0;
  constructor(private fetcher: (url: string, options: RequestInit) => Promise<Response> = (url, options) => fetch(url, options)) {}

  cancel() { this.sequence++; this.controller?.abort(); }

  async run<T>(url: string, handlers: Handlers<T>) {
    this.cancel();
    const sequence = this.sequence;
    const controller = new AbortController();
    this.controller = controller;
    const current = () => sequence === this.sequence && !controller.signal.aborted;
    try {
      const response = await this.fetcher(url, { signal: controller.signal });
      if (!response.ok) throw new Error('ioc_search_unavailable');
      const data = await response.json() as T;
      if (current()) handlers.success(data);
    } catch {
      if (current()) handlers.error();
    } finally {
      if (current()) handlers.settled();
    }
  }
}
