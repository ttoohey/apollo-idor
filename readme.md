# apollo-idor

Apollo Server schema directive to create opaque ID values.

## Why

Using sequential integers as primary keys for database objects is a common
pattern that makes database design simpler. It's a good practice to obfuscate
these keys from users to help avoid security issues.

`indirectDirectiveTransformer()` makes the transformation from private values to
public values transparent at the GraphQL layer. GraphQL clients see opaque
strings for object IDs, while GraphQL resolvers see the private integers that
are stored in the database. Opaque values are encoded with a type to ensure
they can only be used to reference a specific type.

This strategy helps:

- ID values for objects of different types are different strings even if the underlying database keys are the same
- GraphQL clients cannot manipulate the opaque strings
- per-user context settings can be used to create opaque values that are specific to a user

## Usage

```sh
npm add apollo-idor
```

```graphql
# typeDefs.graphql
directive @indirect(
  type: String
  scope: String = "PUBLIC"
  raw: Boolean = false
) on ARGUMENT_DEFINITION | FIELD_DEFINITION | INPUT_FIELD_DEFINITION

type Person {
  # Person.id will be returned as the opaque public ID value
  id: ID! @indirect(type: "Person")
}

type Mutation {
  updatePerson(
    # the `id` argument is provided by the client as the public ID, but the
    # `updatePerson` resolver will see the private database id.
    id: ID @indirect(type: "Person")
    name: String
    input: PersonInput
  ): Person
}

input PersonInput {
  # Any field that has an argument of type PersonInput will have that argument
  # transformed from the public id to the private id.
  id: ID! @indirect(type: "Person")
  name: String
}
```

```js
// server.js
import indirectDirectiveTransformer from "apollo-idor";
import { ApolloServer } from "apollo-server";
import { makeExecutableSchema } from "graphql-tools";
import typeDefs from "./typeDefs";
import resolvers from "./resolvers";

let schema = makeExecutableSchema({ typeDefs, resolvers }));

// set a unique salt for ID transforms
const options = { salt: process.env.APP_KEY }
schema = indirectDirectiveTransformer("indirect", options)(schema)

const server = new ApolloServer({ schema });
```

## Schema Directive API

The `@indirect` directive has three arguments:

- `type` - when transforming to a public ID, this is embedded into the public ID; when transforming from a public ID an exception will be thrown if the embedded type does not match
- `scope` - specifies how the scope argument for transformation is sourced. If not provided the scope will be public. It can be set to 'PUBLIC' to use the public scope, or 'CONTEXT' to read a value from the `indirect` property of the context object. It's recommended to provide a default value in the directive definition
- `raw` - a boolean; if set to `true` the transformed value will be an instance of an `idor` value. This can be useful if a resolver's behaviour is driven by the type

The `indirectDirectiveTransformer()` function takes two arguments:

- `directiveName` - the name of the directive (conventionally "indirect")
- `options` - an object containing initialisation settings
  - `scopeResolvers` - object to extend the possible values for the directive `scope` argument
  - `salt` - passed to the `idor` constructor to initialise encryption salt; this should be a random string at least 16 bytes long which is treated as a secret by the application
  - other options are passed through to the `idor` constructor

`indirectDirectiveTransformer()` returns a function to use as a schema transformer.
The returned function accepts a schema object (created using
`makeExecutableSchema()`), and returns a new executable schema.
