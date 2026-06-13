"use client";

import { formatRut } from "@/lib/rut";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  center?: boolean;
}

// Input de RUT reutilizable. Muestra SIEMPRE el formato con puntos y guion
// (12.345.678-9), sin importar cómo venga el valor, para mantener consistencia.
export default function RutInput({
  value,
  onChange,
  placeholder = "12.345.678-9",
  className = "input-game",
  center = false,
}: Props) {
  return (
    <input
      className={`${className}${center ? " text-center text-xl tracking-wide" : ""}`}
      value={formatRut(value)}
      onChange={(e) => onChange(formatRut(e.target.value))}
      placeholder={placeholder}
      inputMode="text"
    />
  );
}
