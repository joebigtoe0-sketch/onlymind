import { useEffect, useState } from "react";

// The inscription, shown to the watchers: the one string the mind carries but
// cannot read. For us it's the contract address; one click copies it.

export function ContractAddress() {
  const [ca, setCa] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/health")
        .then((r) => r.json())
        .then((d: { ca?: string | null }) => {
          if (alive) setCa(d.ca ?? null);
        })
        .catch(() => {
          if (alive) window.setTimeout(load, 5000);
        });
    load();
    return () => {
      alive = false;
    };
  }, []);

  if (!ca) return null;

  const short = ca.length > 18 ? `${ca.slice(0, 9)}…${ca.slice(-7)}` : ca;

  const copy = () => {
    navigator.clipboard
      .writeText(ca)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {});
  };

  return (
    <div className="ca-box" title={ca}>
      <span className="ca-label">contract address</span>
      <code className="ca-value">{short}</code>
      <button className="ca-copy" onClick={copy}>
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
