import { useEffect, useRef } from "react";

/**
 * Adds an `is-visible` class to the element when it scrolls into view.
 * Pair with the `.reveal` utility in index.css for the subtle fade + 6px lift.
 */
export const useReveal = <T extends HTMLElement = HTMLElement>() => {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return ref;
};
