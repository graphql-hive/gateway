User 1 token with the 'ReadComments' role:

`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwicm9sZXMiOlsiUmVhZENvbW1lbnRzIl0sImlhdCI6MTcyNDE0MTQwNiwiZXhwIjoxNzU1Njk5MDA2fQ.yNmp7hrCWorrdHfJ1IOFyA33UeU2ak72GgjxJ-wuWdE`

User 2 token with 'ReadComments' and 'ReadUsersName' roles:

`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyIiwicm9sZXMiOlsiUmVhZENvbW1lbnRzIiwiUmVhZFVzZXJzTmFtZSJdLCJpYXQiOjE3MjQxNDE0MTgsImV4cCI6MTc1NTY5OTAxOH0.wnR3TDJDljtZ9cwP_XYAm1c-prvkDTzkD-cqbDbBui0`

### User 1 Flow (with ReadComments role)

> It never reaches to `Users` subgraph because `User.name` is not authorized for this user.

```mermaid
flowchart LR
	1(["End-user"]) --->|"query { comments { id author { id name }}}"| 2

    3--->7["Remote JWKS"]

    subgraph Hive Gateway
    2["Gateway Engine"]
    3["JWT Plugin"]
    4["Query Planner"]
    2--->|"Bearer XYZ"|3
    3--->|"{ sub: 1, roles: ["ReadComments"] }"|2
    2--->4
    end

    subgraph "Comments"
        6["Yoga Engine"]
        6--->8["validateHMAC"]

        4--->|"X-HMAC-Signature: XyZ\nquery: query { comments { id author { id }} }\nextensions: { jwt: { sub: 1, roles: ["ReadComments"] }}"|6
    end
```

### User 2 Flow (read:comments and read:users_names)

```mermaid
flowchart LR
	1(["End-user"]) --->|"query { comments { id author { id name }}}"| 2

    3--->7["Remote JWKS"]

    subgraph Hive Gateway
    2["Gateway Engine"]
    3["JWT Plugin"]
    4["Query Planner"]
    2--->|"Bearer XYZ"|3
    3--->|"{ sub: 2, roles: ["ReadComments", "ReadUsersNames"] }"|2
    2--->4
    end

    subgraph "Users"
        5["Yoga Engine"]
        5--->9["validateHMAC"]
        5--->10["extractJWT"]
        4--->|"X-HMAC-Signature: AbC\nquery: query { _entities(representations: $r) { ... on User { name }} }\nextensions: { jwt: { sub: 2, roles: ["ReadComments", "ReadUsersNames"] }}"|5
    end

    subgraph "Comments"
        6["Yoga Engine"]
        6--->8["validateHMAC"]

        4--->|"X-HMAC-Signature: XyZ\nquery: query { comments { id author { id }} }\nextensions: { jwt: { sub: 123, sub: 2, roles: ["ReadComments", "ReadUsersNames"] }}"|6
    end
```
