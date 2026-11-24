"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { FormState } from "@/actions/auth";

/** A form wired to a server action that shows its error/success message. */
export function ActionForm({
  action,
  children,
  submitLabel,
  className,
  resetOnSuccess,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  submitLabel: string;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className ?? "space-y-4"}>
      {children}
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">{state.ok}</p>}
      <button className="btn" disabled={pending}>
        {pending ? "Working…" : submitLabel}
      </button>
    </form>
  );
}
