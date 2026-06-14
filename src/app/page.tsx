import Link from "next/link";
import HomeValidator from "@/components/HomeValidator";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-5 py-10">
      <div className="text-center mb-8 animate-pop">
        <div className="text-7xl mb-3">🪪</div>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-[#27407a]">
          Registro Escolar
        </h1>
        <p className="mt-3 text-lg text-[#5b6b94] font-semibold">
          Listas y validación con reconocimiento facial
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 w-full max-w-md">
        <HomeValidator />

        <Link
          href="/mantenedor"
          className="btn-game btn-orange text-xl py-6 !text-white"
        >
          <span className="text-2xl">🧑‍🏫</span> Mantenedor
        </Link>
      </div>

      <p className="mt-8 text-sm text-[#7a88aa] max-w-md text-center">
        La clave de cada programa se genera y se ve en su configuración
        (Gestión → Programas).
      </p>
      <p className="mt-3 text-sm text-[#7a88aa] max-w-md text-center">
        Cuidamos los datos: solo guardamos el patrón matemático de la cara,
        nunca la foto del estudiante.
      </p>
    </main>
  );
}
