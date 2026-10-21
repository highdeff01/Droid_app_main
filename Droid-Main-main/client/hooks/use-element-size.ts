import { useEffect, useState, type RefObject } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/** Content-box size of the referenced element, kept current by a ResizeObserver. */
export function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const update = (width: number, height: number) =>
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    update(element.clientWidth, element.clientHeight);
    const observer = new ResizeObserver(([entry]) =>
      update(entry.contentRect.width, entry.contentRect.height),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
