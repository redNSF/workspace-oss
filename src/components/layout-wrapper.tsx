"use client";

import { useSidebarStore } from "@/store/sidebar-store";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebarStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <motion.main
      initial={false}
      animate={{
        marginLeft: mounted ? (isCollapsed ? 64 : 240) : 240,
      }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden"
    >
      {children}
    </motion.main>
  );
}
