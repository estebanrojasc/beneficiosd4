import Link from "next/link";
import HomeValidator from "@/components/HomeValidator";
import BrandHeader from "@/components/BrandHeader";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-5 py-10">
      <BrandHeader
        fallbackEmoji="🪪"
        subtitle="Listas y validación con reconocimiento facial"
      />

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
