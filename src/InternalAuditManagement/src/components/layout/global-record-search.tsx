"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

type SearchResult = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  claimId?: string;
};

type SearchGroup = {
  key: string;
  label: string;
  items: SearchResult[];
};

export function GlobalRecordSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    setRecentSearches(readRecentSearches());
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        event.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setGroups([]);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();
    setIsLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/v1/search?q=${encodeURIComponent(normalized)}`, {
          cache: "no-store",
          signal: controller.signal
        });
        const data = await response.json();
        if (response.ok && isMounted) setGroups(data.groups ?? []);
      } catch {
        if (isMounted) setGroups([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }, 250);

    return () => {
      isMounted = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    const normalized = query.trim();
    if (normalized) {
      const nextRecent = [normalized, ...recentSearches.filter((item) => item !== normalized)].slice(0, 5);
      setRecentSearches(nextRecent);
      localStorage.setItem("recent-record-searches", JSON.stringify(nextRecent));
    }
    if (normalized) params.set("q", normalized);
    else params.delete("q");
    const next = params.toString();
    router.push(next ? `${pathname}?${next}` : pathname);
    setIsOpen(false);
  }

  function clear() {
    setQuery("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    const next = params.toString();
    router.push(next ? `${pathname}?${next}` : pathname);
    setGroups([]);
    setIsOpen(false);
  }

  function chooseRecent(value: string) {
    setQuery(value);
    setIsOpen(true);
  }

  const resultCount = groups.reduce((sum, group) => sum + group.items.length, 0);
  const normalizedQuery = query.trim();

  return (
    <div className="smart-search-wrap">
      <form className="global-search" onSubmit={submit} role="search">
        <Search aria-hidden="true" size={16} />
        <input
          aria-label="Search records on this page"
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search ticket, employee, vendor, invoice, site, amount"
          ref={inputRef}
          value={query}
        />
        <button aria-label="Run smart search" type="submit">
          <Search size={14} />
        </button>
        {query ? (
          <button aria-label="Clear smart search" onClick={clear} type="button">
            <X size={14} />
          </button>
        ) : null}
      </form>
      {isOpen ? (
        <div className="smart-search-popover">
          <div className="smart-search-meta">
            <span>{isLoading ? "Searching..." : normalizedQuery.length >= 2 ? `${resultCount} result(s)` : "Type 2+ characters or press / anytime"}</span>
          </div>
          {normalizedQuery.length < 2 && recentSearches.length > 0 ? (
            <div className="smart-search-group">
              <strong>Recent searches</strong>
              <div className="recent-searches">
                {recentSearches.map((item) => (
                  <button className="badge success" key={item} onClick={() => chooseRecent(item)} type="button">{item}</button>
                ))}
              </div>
            </div>
          ) : null}
          {groups.map((group) => (
            <div className="smart-search-group" key={group.key}>
              <strong>{group.label}</strong>
              {group.items.map((item) => (
                <Link className="smart-search-result" href={resultHref(item, normalizedQuery)} key={`${group.key}:${item.id}`} onClick={() => setIsOpen(false)}>
                  <span>{item.title}</span>
                  <small>{item.subtitle}</small>
                </Link>
              ))}
              {normalizedQuery.length >= 2 && group.items.length === 0 ? <span className="muted">No matches</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function resultHref(item: SearchResult, query: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (item.claimId) params.set("claim", item.claimId);
  const suffix = params.toString();
  return suffix ? `${item.href}?${suffix}` : item.href;
}

function readRecentSearches() {
  try {
    const parsed = JSON.parse(localStorage.getItem("recent-record-searches") ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}
