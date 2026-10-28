import type { ReactNode } from "react";
import Link from "next/link";
import { Wordmark } from "@accordiq/ui";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-gutter py-16">
      <Link href="/" aria-label="AccordIQ home" className="self-center rounded-md">
        <Wordmark />
      </Link>
      <main id="main" className="mt-8">
        {children}
      </main>
    </div>
  );
}
