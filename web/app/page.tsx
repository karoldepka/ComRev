import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold tracking-tight">CompaReview</h1>
      <p className="text-lg text-gray-500 max-w-md text-center">
        Compare open-source projects and products side by side with AI-assisted research.
      </p>
      <Link
        href="/compare/demo"
        className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
      >
        Open demo comparison
      </Link>
    </main>
  );
}
