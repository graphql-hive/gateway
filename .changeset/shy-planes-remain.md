---
'@graphql-hive/gateway': patch
---

Bump OpenSSL to the latest in the Docker image;
The previous version in our Docker images had a security vulnerability reported the following due to the version of OpenSSL:
- https://avd.aquasec.com/nvd/cve-2025-9230
- https://avd.aquasec.com/nvd/cve-2025-9231