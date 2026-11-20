---
'@graphql-tools/stitch': patch
---

Allow `forwardArgsToSelectionSet` to rename arguments when forwarding.

Mapping values may be a `string[]` (same-name filter, existing behaviour) or a `Record<string, string>` that maps gateway arg names onto different selection-field arg names (e.g. `{ country: 'countryCode' }` for `salePrice(country:)` → `priceForCountry(countryCode:)`).
