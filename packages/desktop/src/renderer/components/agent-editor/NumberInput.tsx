/**
 * @file src/renderer/components/agent-editor/NumberInput.tsx
 * @description Agent 编辑器内统一的数字输入框样式
 */

import React from 'react';

interface NumberInputProps {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
}

/** 受控数字输入框，统一样式与回调签名 */
export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  min,
  max,
}) => (
  <input
    type="number"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    min={min}
    max={max}
    className="rounded-lg border border-border h-8 w-24 px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
  />
);
