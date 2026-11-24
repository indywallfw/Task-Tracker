"use client";

import type { ComponentProps } from "react";

/** A <select> that submits its form as soon as the value changes. */
export function AutoSubmitSelect(props: ComponentProps<"select">) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

/** An <input> (e.g. type=date) that submits its form when changed. */
export function AutoSubmitInput(props: ComponentProps<"input">) {
  return <input {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
