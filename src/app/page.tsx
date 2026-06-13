import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-5 py-10">
      <div className="text-center mb-10 animate-pop">
        <div className="text-7xl mb-3">🍽️</div>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-[#27407a]">
          Almuerzo Escolar
        </h1>
        <p className="mt-3 text-lg text-[#5b6b94] font-semibold">
          Ingreso rápido y seguro con reconocimiento facial
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-3xl">
        <Link href="/validar" className="btn-game btn-green text-2xl py-8">
          <span className="text-3xl">📷</span> Validar ingreso
        </Link>
        <Link href="/enrolar" className="btn-game btn-purple text-2xl py-8">
          <span className="text-3xl">✋</span> Enrolarme
        </Link>
        <Link
          href="/mantenedor"
          className="btn-game btn-orange text-2xl py-8 sm:col-span-2 !text-white"
        >
          <span className="text-3xl">🧑‍🏫</span> Mantenedor (docente)
        </Link>
      </div>

      <p className="mt-10 text-sm text-[#7a88aa] max-w-md text-center">
        Cuidamos los datos: solo guardamos el patrón matemático de la cara,
        nunca la foto del estudiante.
      </p>
    </main>
  );
}
