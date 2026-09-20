"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Planner, seed, validJob } from "@/lib/planner";

const KEY = "foreman-planner-v1";
const EMPTY: Planner = {
  jobs: [],
  checks: [],
  delivered: [],
  company: "Foreman",
};
const Context = createContext<{
  plan: Planner;
  update: (fn: (p: Planner) => Planner) => void;
  ready: boolean;
  message: string;
}>({ plan: EMPTY, update: () => {}, ready: false, message: "" });

export function PlannerProvider({ children }: { children: React.ReactNode }) {
  const [plan, setPlan] = useState<Planner>(EMPTY);
  const current = useRef(plan);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let initial = seed();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (
          !Array.isArray(data.jobs) ||
          !data.jobs.every(validJob) ||
          !Array.isArray(data.checks) ||
          !data.checks.every((x: unknown) => typeof x === "string") ||
          !Array.isArray(data.delivered) ||
          !data.delivered.every((x: unknown) => typeof x === "string") ||
          typeof data.company !== "string"
        )
          throw Error("Invalid saved plan");
        initial = data;
      } else {
        localStorage.setItem(KEY, JSON.stringify(initial));
      }
    } catch {
      setMessage(
        "Saved workspace could not be read or initialized. Sample plan loaded; export your changes to keep a backup.",
      );
    }
    current.current = initial;
    setPlan(initial);
    setReady(true);
  }, []);

  function update(fn: (p: Planner) => Planner) {
    const next = fn(current.current);
    current.current = next;
    setPlan(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      setMessage("");
    } catch {
      setMessage(
        "Browser storage is unavailable. Changes last for this session; export a backup in Settings.",
      );
    }
  }

  return (
    <Context.Provider value={{ plan, update, ready, message }}>
      {children}
    </Context.Provider>
  );
}
export const usePlanner = () => useContext(Context);
