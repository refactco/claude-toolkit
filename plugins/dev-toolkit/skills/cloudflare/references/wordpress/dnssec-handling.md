# DNSSEC handling during a nameserver migration

DNSSEC is the silent killer of nameserver changes. The migration looks fine, propagation looks fine, then somewhere in the world resolvers start SERVFAIL'ing the domain.

## What goes wrong

DNSSEC chains trust from the TLD registry down to the zone. The TLD registry holds a **DS** record for the domain, which is a hash of the zone's public key. If you change nameservers without removing the old DS record:
- Resolvers fetch the new nameservers (Cloudflare's)
- Resolvers ask Cloudflare for the zone's keys
- Cloudflare's keys don't match the registrar's DS hash (old provider's keys)
- Resolver returns SERVFAIL — users see "this site can't be reached"

## The correct order of operations

1. **At the old DNS provider**: Disable DNSSEC. This removes the DS record.
2. **Wait** for DS to drop from the registry — verify with `dig DS example.com +short` (should return empty). Usually a few hours.
3. **At the registrar**: Change nameservers to Cloudflare.
4. **In Cloudflare DNS**: zone goes Active.
5. **Optional**: Enable DNSSEC in Cloudflare DNS → Cloudflare gives you a new DS record.
6. **At the registrar**: add the new DS record.

## How to tell DNSSEC is on at the old provider

```bash
dig DS example.com +short
# Empty → DNSSEC is off, safe to proceed
# Returns hex / digest → DNSSEC is on; disable at old provider first

dig DNSKEY example.com +short
# Empty → no zone-level DNSSEC
```

Both must be empty before changing nameservers.

## When the client can't disable DNSSEC at the old provider

Some hosts (Vercel, some Squarespace setups) tie DNSSEC to DNS hosting. Workaround:
1. Have the registrar **remove the DS record manually**. Most registrars have this in domain settings.
2. Wait 24h for caches.
3. Then change nameservers.

## Enable DNSSEC on Cloudflare after migration (optional)

```javascript
await execute(async (cloudflare) => {
  return cloudflare.dnssec.edit({
    zone_id: "{{zone_id}}",
    status: "active",
  });
});
```

Cloudflare returns a DS record to add at the registrar. Most Refact clients live unsigned — enable only when the client specifically requests DNSSEC.
