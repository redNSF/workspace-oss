"use client";

import { useState, useEffect } from "react";

export function ClientGreeting({ firstName }: { firstName: string }) {
  const [greeting, setGreeting] = useState('Welcome');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, []);

  return (
    <h1 className="text-4xl font-bold tracking-tight text-white">
      {greeting}, <span className="text-white/70">{firstName}</span> 👋
    </h1>
  );
}
