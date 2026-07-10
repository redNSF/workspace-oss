"use client";

import { motion } from "framer-motion";
import { Layers } from "lucide-react";

interface AuthSplashProps {
  type: "hello" | "goodbye";
  userName?: string;
}

export function AuthSplash({ type, userName }: AuthSplashProps) {
  const isHello = type === "hello";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0d0d0d] overflow-hidden">
      {/* Background gradients */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[30%] w-[600px] h-[600px] rounded-full bg-[#8b5cf6]/10 blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[20%] w-[500px] h-[500px] rounded-full bg-indigo-500/5 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative flex flex-col items-center text-center"
      >
        <div className="mb-8 relative">
          <motion.div 
            initial={{ rotate: -20, scale: 0 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-16 h-16 rounded-2xl bg-[#8b5cf6] flex items-center justify-center shadow-[0_0_40px_-10px_rgba(139,92,246,0.5)]"
          >
            <Layers size={32} className="text-white" />
          </motion.div>
          <motion.div
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.6, 0.3]
            }}
            transition={{ 
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute -inset-4 bg-[#8b5cf6]/20 rounded-full blur-2xl -z-10"
          />
        </div>

        <motion.h2 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-4xl font-bold tracking-tight text-white mb-3"
        >
          {isHello ? "Welcome back" : "See you soon"}
        </motion.h2>

        {userName && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-xl text-white/60 font-medium"
          >
            {userName}
          </motion.p>
        )}

        <motion.div
          initial={{ width: 0 }}
          animate={{ width: 200 }}
          transition={{ delay: 0.8, duration: 1, ease: "easeInOut" }}
          className="h-[2px] bg-gradient-to-r from-transparent via-[#8b5cf6] to-transparent mt-10"
        />
      </motion.div>
    </div>
  );
}
