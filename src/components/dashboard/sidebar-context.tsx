"use client";

import { createContext, useContext } from "react";

export const SidebarContext = createContext<{
  toggle: () => void;
}>({ toggle: () => {} });

export const useSidebarToggle = () => useContext(SidebarContext);
