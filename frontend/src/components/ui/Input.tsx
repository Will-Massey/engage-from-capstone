/**
 * Input Component
 */

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: React.ElementType;
  rightIcon?: React.ElementType;
  onRightIconClick?: () => void;
}

export const Input: React.FC<InputProps> = ({
  label,
  helperText,
  error,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  onRightIconClick,
  className = '',
  ...props
}) => {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-slate-700">
          {label}
          {props.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        {LeftIcon && (
          <LeftIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        )}
        <input
          className={`
            w-full px-3.5 py-2.5 bg-white border rounded-lg text-sm text-slate-800
            placeholder:text-slate-400
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500
            disabled:bg-slate-50 disabled:text-slate-500
            ${LeftIcon ? 'pl-10' : ''}
            ${RightIcon || error ? 'pr-10' : ''}
            ${error ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-300'}
            ${className}
          `}
          {...props}
        />
        {error ? (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500">!</div>
        ) : RightIcon ? (
          <button
            type="button"
            onClick={onRightIconClick}
            className={`absolute right-3 top-1/2 -translate-y-1/2 ${onRightIconClick ? 'cursor-pointer hover:text-slate-600' : ''}`}
          >
            <RightIcon className="w-5 h-5 text-slate-400" />
          </button>
        ) : null}
      </div>
      {helperText && !error && <p className="text-xs text-slate-500">{helperText}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
};

export default Input;
