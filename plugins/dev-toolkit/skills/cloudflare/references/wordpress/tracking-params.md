# Tracking parameters and the cache key

The biggest low-cache-hit-rate root cause after origin-side `Cache-Control: private` is **query string fragmentation**. When Cloudflare's cache key includes the full query string, every visitor arriving from a different campaign has a unique cache entry. With 1000 visitors from 1000 campaigns, hit rate trends toward zero.

## Parameters to strip from cache key

| Param | Source | Strip? |
|---|---|---|
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` | Google Analytics / general tracking | YES |
| `_ga`, `_gl` | Google Analytics cross-domain linker | YES |
| `gclid` | Google Ads click ID | YES |
| `fbclid` | Facebook click ID | YES |
| `msclkid` | Microsoft Ads click ID | YES |
| `mc_cid`, `mc_eid` | Mailchimp campaign / email IDs | YES |
| `__hstc`, `__hssc`, `__hsfp` | HubSpot tracking (cross-domain) | YES |
| `__s` | HubSpot subscriber ID | YES |
| `rb_clickid` | Random click ID some affiliates use | YES |
| `page` | Pagination | **NO** — actually changes content |
| `category` | Category filter | **NO** — actually changes content |
| `lang` | Language switch | **NO** — actually changes content |
| `?p=N` | WordPress internal post lookup | **NO** |
| `?preview=true`, `?preview_id=N` | WordPress preview | **NO**, but bypass cache entirely |

## How HubSpot specifically breaks cache

HubSpot's cross-domain tracking script appends `__hstc`, `__hssc`, `__hsfp` to outbound links. Every visitor arriving from a HubSpot email has a unique cache entry. The fix is to exclude these from the cache key:

```javascript
action_parameters: {
  cache: true,
  cache_key: {
    custom_key: {
      query_string: {
        exclude: { list: ["__hstc", "__hssc", "__hsfp", "__s"] },
      },
    },
  },
  edge_ttl: { mode: "override_origin", default: 14400 },
}
expression: '(http.request.method eq "GET" and not http.cookie contains "wordpress_logged_in_")'
```

## Strip from cache key vs strip from URL

- **Strip from cache key** (preferred): params still flow to origin so analytics attributes correctly, only the cache key ignores them.
- **Strip from URL via Transform Rule**: cleaner logs but breaks client's marketing attribution.

Default to strip from cache key.

## How to find what params are causing fragmentation

```javascript
// Pull most common request paths with query strings via GraphQL
await execute(async (cloudflare) => {
  return cloudflare.graphql({
    query: `query($zoneTag: String!, $since: Time!) {
      viewer { zones(filter: { zoneTag: $zoneTag }) {
        httpRequestsAdaptiveGroups(
          filter: { datetime_geq: $since }
          limit: 100
          orderBy: [count_DESC]
        ) {
          count
          dimensions { clientRequestPath }
        }
      }}
    }`,
    variables: { zoneTag: "{{zone_id}}", since: new Date(Date.now() - 24*60*60*1000).toISOString() },
  });
});
```
