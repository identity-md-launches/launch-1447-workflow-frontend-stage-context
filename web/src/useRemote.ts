import { useEffect, useState, useRef, type DependencyList } from "react";
import { errorText } from "./protocol";
export function useRemote<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList,
  retainKey?: string,
) {
  const previousKey = useRef<string | undefined>(undefined);
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    if (retainKey === undefined || previousKey.current !== retainKey)
      setData(undefined);
    previousKey.current = retainKey;
    setError("");
    setLoading(true);
    fetcher()
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, deps);
  return { data, error, loading };
}
