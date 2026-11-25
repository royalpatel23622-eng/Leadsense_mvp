# Future website-intelligence integration

## Status

This is an architecture proposal only. LeadSense does not currently scan websites, crawl links, measure performance, run Lighthouse, inspect SEO, or infer sales opportunities from a website. The independent CRM stores only information a user has researched and entered.

## Boundary

Keep a future scanner in its own server-side module, for example `lib/website-intelligence/`. It should accept a validated public website URL and an explicit set of checks, then return a versioned report with findings and provenance. It must not import YouTube discovery code, reuse YouTube API fields, or write to creator records.

Suggested interface:

```js
scanWebsite({ url, checks, signal }) => Promise<{
  schemaVersion: 1,
  targetUrl: string,
  scannedAt: string,
  checks: Array<{
    id: string,
    status: 'finding' | 'not_found' | 'not_checked' | 'error',
    summary: string,
    evidenceUrl?: string,
    checkedAt: string
  }>
}>
```

The interface reports observable evidence, not a universal quality or purchase-intent score. A missing form in a limited scan should be `not_checked` unless the scanner has enough evidence to support `not_found`. Each result should name its source and scan time.

## Integration path

1. Implement and test the scanner independently, with its own network and data-retention policy.
2. Put a server adapter between the module and HTTP routes. The adapter owns authentication, account limits, timeouts, and response validation.
3. Add a separate user-owned report table only after retention, deletion, re-scan, and source-provenance behavior are defined.
4. Connect a UI action from an independently researched business prospect. Keep scan reports separate from YouTube channel data and creator evidence.
5. Ship behind an explicit feature flag and verify SSRF controls, redirect handling, private-network blocking, DNS rebinding protections, bounded response sizes, and per-host rate limits before enabling public scans.

## Security and operations requirements

- Accept only `http` and `https`, reject credentials and unsupported ports, and resolve and block loopback, private, link-local, multicast, and reserved addresses for both IPv4 and IPv6.
- Revalidate every redirect target and every resolved address; cap redirects, DNS lookups, response bytes, decompressed bytes, and total scan time.
- Do not fetch arbitrary page resources, execute page JavaScript, follow forms, or run browser automation by default.
- Do not send cookies, user credentials, or internal network headers to target sites.
- Store short, source-backed observations only. Define retention and deletion before persisting reports.
- Treat a scan as technical evidence, not proof that a business needs or will buy a service.

No route, scanner implementation, background worker, or fabricated website result is included in the current product.
