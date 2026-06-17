"use client";

import { FormEvent, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

export function GlobalRecordSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    const normalized = query.trim();
    if (normalized) params.set("q", normalized);
    else params.delete("q");
    const next = params.toString();
    router.push(next ? `${pathname}?${next}` : pathname);
  }

  function clear() {
    setQuery("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    const next = params.toString();
    router.push(next ? `${pathname}?${next}` : pathname);
  }

  return (
    <form className="global-search" onSubmit={submit} role="search">
      <Search aria-hidden="true" size={16} />
      <input
        aria-label="Search records on this page"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search records"
        value={query}
      />
      <button aria-label="Run record search" type="submit">
        <Search size={14} />
      </button>
      {query ? (
        <button aria-label="Clear record search" onClick={clear} type="button">
          <X size={14} />
        </button>
      ) : null}
    </form>
  );
}
