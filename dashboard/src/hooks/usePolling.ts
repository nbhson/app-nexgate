import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/utils";

export interface PollingResult {
  /** Đang fetch nền (không bật skeleton). */
  refreshing: boolean;
  lastUpdated: Date | null;
  /** Lỗi của lần fetch gần nhất — null khi mọi thứ ổn. */
  error: string | null;
  /** Số lần fail liên tiếp — dùng cho banner "đang thử lại...". */
  failCount: number;
  /** Fetch ngay (nút Refresh / "Thử lại ngay"). */
  refresh: () => Promise<void>;
}

/**
 * Fetch khi mount, rồi mỗi `intervalMs`. Tạm dừng khi tab ẩn và
 * fetch bù ngay khi tab quay lại (nếu dữ liệu đã cũ hơn interval).
 * `background=false` chỉ đúng lần đầu — page dùng để bật skeleton.
 * `deps` đổi → fetch nền ngay lập tức (filter, phân trang...).
 */
export function usePolling(
  fetcher: (opts: { background: boolean }) => Promise<void>,
  intervalMs = 15_000,
  deps: unknown[] = []
): PollingResult {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const busyRef = useRef(false);
  const queuedRef = useRef(false);
  const lastUpdatedRef = useRef<Date | null>(null);
  const mountedRef = useRef(false);

  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failCount, setFailCount] = useState(0);

  const run = useCallback(
    async (background: boolean): Promise<void> => {
      if (busyRef.current) {
        queuedRef.current = true;
        return;
      }
      busyRef.current = true;
      if (background) setRefreshing(true);
      try {
        await fetcherRef.current({ background });
        const now = new Date();
        lastUpdatedRef.current = now;
        setLastUpdated(now);
        setError(null);
        setFailCount(0);
      } catch (err) {
        setError(errorMessage(err));
        setFailCount((n) => n + 1);
      } finally {
        busyRef.current = false;
        setRefreshing(false);
        if (queuedRef.current) {
          queuedRef.current = false;
          void run(true);
        }
      }
    },
    []
  );

  //Fetch lần đầu khi mount
  useEffect(() => {
    void run(false);
    mountedRef.current = true;
  }, [run]);

  // deps đổi → fetch nền ngay (bỏ qua lần mount đầu)
  useEffect(() => {
    if (mountedRef.current) void run(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Đồng hồ polling + fetch bù khi tab hiện lại
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void run(true);
    }, intervalMs);

    const onVisible = () => {
      const last = lastUpdatedRef.current;
      const stale = !last || Date.now() - last.getTime() > intervalMs;
      if (document.visibilityState === "visible" && stale) void run(true);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, run]);

  const refresh = useCallback(() => run(true), [run]);

  return { refreshing, lastUpdated, error, failCount, refresh };
}
