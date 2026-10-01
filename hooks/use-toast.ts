"use client";
import { useCallback, useState } from "react";

export function useToast() {
  const [message, setMessage] = useState("");
  const notify = useCallback((next: string) => {
    setMessage(next);
    window.setTimeout(() => setMessage(""), 2400);
  }, []);
  return { message, notify };
}
