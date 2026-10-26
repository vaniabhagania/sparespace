import Link from "next/link";

export default function NotFound() {
  return (
    <div className="shell py-16 md:py-24">
      <div className="mx-auto max-w-xl">
        <h1 className="text-[clamp(3rem,10vw,5.5rem)]">This bay is empty</h1>
        <p className="mt-4 text-lg text-stone">We can&apos;t find that page. The space or booking may have been removed, or the link might be mistyped.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/" className="btn btn-primary">Find a space</Link>
          <Link href="/bookings" className="btn btn-ghost">Your trips</Link>
        </div>
      </div>
    </div>
  );
}
