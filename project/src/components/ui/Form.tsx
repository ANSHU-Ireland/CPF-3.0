import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
  useId,
} from 'react';

const fieldBase =
  'w-full rounded-control border border-border bg-surface px-3 py-2.5 text-ink ' +
  'placeholder:text-ink-secondary/60 transition-colors ' +
  'focus:border-focus focus:ring-2 focus:ring-focus/20 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'min-h-[44px]';

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
  className = '',
}: FormFieldProps) {
  const generatedId = useId();
  const id = htmlFor ?? generatedId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required && (
          <span className="text-status-danger ml-0.5" aria-hidden>
            {' *'}
          </span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-ink-secondary">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-status-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, hint, required, id, className = '', ...rest }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <FormField label={label} htmlFor={fieldId} required={required} error={error} hint={hint}>
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          className={`${fieldBase} ${error ? 'border-status-danger' : ''} ${className}`}
          {...rest}
        />
      </FormField>
    );
  },
);
TextField.displayName = 'TextField';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, error, hint, required, id, className = '', ...rest }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <FormField label={label} htmlFor={fieldId} required={required} error={error} hint={hint}>
        <textarea
          ref={ref}
          id={fieldId}
          aria-invalid={!!error}
          className={`${fieldBase} min-h-[120px] resize-y ${error ? 'border-status-danger' : ''} ${className}`}
          {...rest}
        />
      </FormField>
    );
  },
);
TextArea.displayName = 'TextArea';

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  options: Array<{ value: string; label: string }>;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, error, hint, required, id, options, className = '', ...rest }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <FormField label={label} htmlFor={fieldId} required={required} error={error} hint={hint}>
        <select
          ref={ref}
          id={fieldId}
          aria-invalid={!!error}
          className={`${fieldBase} ${error ? 'border-status-danger' : ''} ${className}`}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </FormField>
    );
  },
);
SelectField.displayName = 'SelectField';

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, error, id, ...rest }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-start gap-2.5">
          <input
            ref={ref}
            id={fieldId}
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-border text-brand focus:ring-2 focus:ring-focus/20"
            {...rest}
          />
          <label htmlFor={fieldId} className="text-sm text-ink select-none cursor-pointer">
            {label}
          </label>
        </div>
        {error && (
          <p role="alert" className="text-sm text-status-danger">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Checkbox.displayName = 'Checkbox';

export interface SearchFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(
  ({ label, id, className = '', ...rest }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <div className="relative flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="sr-only">
          {label}
        </label>
        <input
          ref={ref}
          id={fieldId}
          type="search"
          placeholder={label}
          className={`${fieldBase} pl-10 ${className}`}
          {...rest}
        />
        <svg
          className="absolute left-3 top-[38px] h-4 w-4 text-ink-secondary pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
      </div>
    );
  },
);
SearchField.displayName = 'SearchField';
