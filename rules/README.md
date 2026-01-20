# Declarative Net Request Rules

This directory contains rules for Chrome's `declarativeNetRequest` API, which allows the extension to modify network requests.

## Files

- `remove_cors.json` - CORS header modification rules

## Security Considerations

### CORS Header Removal (`remove_cors.json`)

**Purpose**: Allows the extension to make direct API calls to `api.anthropic.com` from the browser.

**Why is this necessary?**

Chrome Extensions using Manifest V3 operate differently from traditional web applications:

1. **No Background Page Proxy**: In MV2, extensions could use background pages to proxy API requests. MV3 uses Service Workers which have limitations and still face CORS restrictions for fetch requests.

2. **Direct API Access**: The Anthropic API expects requests from server-side applications and includes CORS restrictions that block browser-based requests.

3. **Extension Architecture**: This extension runs entirely client-side without a backend server, requiring direct browser-to-API communication.

**What the rule does:**

```json
{
  "action": {
    "type": "modifyHeaders",
    "requestHeaders": [
      {
        "header": "Origin",
        "operation": "remove"
      }
    ]
  },
  "condition": {
    "urlFilter": "||api.anthropic.com/*",
    "resourceTypes": ["xmlhttprequest"]
  }
}
```

- **Scope**: Only affects requests to `api.anthropic.com`
- **Resource Type**: Only affects `xmlhttprequest` (fetch/XHR requests)
- **Modification**: Removes the `Origin` header from requests

**Security Implications:**

1. **Minimal Scope**: The rule only affects Anthropic API requests, not other domains
2. **Header Limitation**: Only the `Origin` header is modified; other security headers remain intact
3. **Authentication Still Required**: API requests still require valid API keys or OAuth tokens
4. **No Cross-Site Risk**: This doesn't enable cross-site attacks; it only allows the extension to communicate with Anthropic's API

**Alternative Approaches Considered:**

1. **Backend Proxy**: Would require hosting a server, adding complexity and cost
2. **Background Page (MV2)**: Not available in Manifest V3
3. **Cloud Functions**: Adds latency and operational overhead

**Manifest Configuration:**

The extension must declare these permissions in `manifest.json`:

```json
{
  "permissions": [
    "declarativeNetRequest",
    "declarativeNetRequestWithHostAccess"
  ],
  "declarative_net_request": {
    "rule_resources": [
      {
        "id": "remove_cors_headers",
        "enabled": true,
        "path": "rules/remove_cors.json"
      }
    ]
  },
  "host_permissions": [
    "https://api.anthropic.com/*"
  ]
}
```

## Updating Rules

When modifying rules:

1. Ensure the scope is as narrow as possible
2. Only modify necessary headers
3. Document the reason for each rule
4. Consider security implications
5. Test thoroughly before deployment

## References

- [Chrome declarativeNetRequest API](https://developer.chrome.com/docs/extensions/reference/declarativeNetRequest/)
- [Manifest V3 migration guide](https://developer.chrome.com/docs/extensions/migrating/to-service-workers/)
