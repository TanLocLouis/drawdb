import { useCallback, useEffect, useState } from "react";
import { diagramApi } from "../../../../../api/diagrams";
import { useTranslation } from "react-i18next";

function readError(error, t) {
  return error?.message || t("failed_to_load_diagrams");
}

export function useDiagramList() {
  const { t } = useTranslation();
  const [state, setState] = useState({ loading: true, error: null, items: [] });

  const refresh = useCallback(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));
    diagramApi
      .list()
      .then((items) => {
        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            items: items.map((item) => ({
              ...item,
              diagramId: item.id,
              lastModified: item.updated_at,
            })),
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ loading: false, error: readError(error, t), items: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(refresh, [refresh]);

  return {
    loading: state.loading,
    error: state.error,
    cloud: [],
    local: state.items,
    cloudEnabled: false,
    currentUserId: null,
    refresh,
  };
}
