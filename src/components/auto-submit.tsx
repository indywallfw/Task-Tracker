"use client";

import type { ComponentProps } from "react";

/** A <select> that submits its form as soon as the value changes. */
export function AutoSubmitSelect(props: ComponentProps<"select">) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

/** A <textarea> that submits its form when it loses focus with a changed value. */
export function SubmitOnBlurTextarea(props: ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      onBlur={(e) => {
        if (e.currentTarget.value !== e.currentTarget.defaultValue) e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}

/** An <input> (e.g. type=date) that submits its form when changed. */
export function AutoSubmitInput(props: ComponentProps<"input">) {
  return <input {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
