"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PredData, validatePredData, MisPrediccion, validateMisPrediccionesResponse } from "@/lib/api/predictions";

interface UsePredictionsOptions {
  sorteo: string;
  date: string;
  enabled: boolean;
  token?: string;
}

interface UsePredictionsResult {
  data: PredData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePredictions({ sorteo, date, enabled, token }: UsePredictionsOptions): UsePredictionsResult {
  const [data, setData] = useState<PredData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPredictions = useCallback(async () => {
    if (!enabled) return;
    
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const url = `/api/predictions?sorteo=${encodeURIComponent(sorteo)}&date=${encodeURIComponent(date)}&t=${Date.now()}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      const validated = validatePredData(json);
      setData(validated);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Error desconocido");
      setData(null);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [sorteo, date, enabled, token]);

  useEffect(() => {
    fetchPredictions();
    return () => abortRef.current?.abort();
  }, [fetchPredictions]);

  return { data, loading, error, refetch: fetchPredictions };
}

interface UseMisPrediccionesOptions {
  token: string | null;
  enabled: boolean;
}

interface UseMisPrediccionesResult {
  data: MisPrediccion[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMisPredicciones({ token, enabled }: UseMisPrediccionesOptions): UseMisPrediccionesResult {
  const [data, setData] = useState<MisPrediccion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchMisPreds = useCallback(async () => {
    if (!enabled || !token) {
      setData([]);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/mis-predicciones", {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      const validated = validateMisPrediccionesResponse(json);
      setData(validated.predictions || []);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Error cargando análisis");
      setData([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [token, enabled]);

  useEffect(() => {
    fetchMisPreds();
    return () => abortRef.current?.abort();
  }, [fetchMisPreds]);

  return { data, loading, error, refetch: fetchMisPreds };
}

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);

  return [state, setState];
}