import { createContext, useCallback, useMemo, useRef, useState } from "react";

export const TransformContext = createContext(null);

export default function TransformContextProvider({ children }) {
  const [transform, setTransformInternal] = useState({
    zoom: 1,
    pan: { x: 0, y: 0 },
  });

  const transformRef = useRef(transform);
  transformRef.current = transform;

  const getTransform = useCallback(() => transformRef.current, []);

  /**
   * @type {typeof DrawDB.TransformContext["setTransform"]}
   */
  const setTransform = useCallback(
    (actionOrValue) => {
      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      const findFirstNumber = (...values) =>
        values.find((value) => typeof value === "number" && !isNaN(value));

      setTransformInternal((prev) => {
        if (typeof actionOrValue === "function") {
          actionOrValue = actionOrValue(prev);
        }

        const next = {
          zoom: clamp(
            findFirstNumber(actionOrValue.zoom, prev.zoom, 1),
            0.02,
            5,
          ),
          pan: {
            x: findFirstNumber(actionOrValue.pan?.x, prev.pan?.x, 0),
            y: findFirstNumber(actionOrValue.pan?.y, prev.pan?.y, 0),
          },
        };
        transformRef.current = next;
        return next;
      });
    },
    [],
  );

  const contextValue = useMemo(
    () => ({
      transform,
      setTransform,
      getTransform,
    }),
    [transform, setTransform, getTransform],
  );

  return (
    <TransformContext.Provider value={contextValue}>
      {children}
    </TransformContext.Provider>
  );
}

