"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="shell py-16 md:py-24">
      <div className="mx-auto max-w-xl">
        <h1 className="text-[clamp(3rem,10vw,5.5rem)]">That didn&apos;t work</h1>
        <p className="mt-4 text-lg text-stone">Something went wrong on our side, not yours. Nothing you did has been lost. Try again, and if it keeps happening, come back in a few minutes.</p>
        {error.digest && <p className="mt-2 text-sm text-stone">Reference: {error.digest}</p>}
        <div className="mt-6 flex flex-wrap gap-2">
          <button onClick={reset} className="btn btn-primary">Try again</button>
          <Link href="/" className="btn btn-ghost">Go home</Link>
        </div>
      </div>
    </div>
  );
}
