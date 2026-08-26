import React, { createContext, useContext, useEffect, useState } from "react";

const HeaderActionsContext = createContext({ actions: null, setActions: () => {} });

export function HeaderActionsProvider({ children }) {
  const [actions, setActions] = useState(null);
  return (
    <HeaderActionsContext.Provider value={{ actions, setActions }}>
      {children}
    </HeaderActionsContext.Provider>
  );
}

// Pages call this to register their header buttons. Auto-clears on unmount
// or when deps change, so navigating away doesn't leave stale buttons
// sitting in the shared layout header.
export function useHeaderActions(node, deps = []) {
  const { setActions } = useContext(HeaderActionsContext);
  useEffect(() => {
    setActions(node);
    return () => setActions(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function useHeaderActionsSlot() {
  return useContext(HeaderActionsContext).actions;
}