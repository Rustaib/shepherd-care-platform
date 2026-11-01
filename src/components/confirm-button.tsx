"use client";
import type { ButtonHTMLAttributes } from "react";

/** Submit button that asks for confirmation first. */
export function ConfirmButton({ message, ...props }: { message: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} onClick={(e) => { if (!confirm(message)) e.preventDefault(); }} />;
}
