import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function getReadingTime(wordCount: number): string {
  const wpm = 200;
  const minutes = Math.ceil(wordCount / wpm);
  return `${minutes} min de leitura`;
}
