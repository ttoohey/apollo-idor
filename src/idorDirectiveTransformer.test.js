import { gql } from "apollo-server";
import { graphql } from "graphql";
import { makeExecutableSchema } from "@graphql-tools/schema";
import idorDirectiveTransformer from "./idorDirectiveTransformer";

describe("GraphQL @indirect directive", () => {
  const users = [
    { id: 1, name: "User 1" },
    { id: 2, name: "User 2" },
  ];
  const typeDefs = gql`
    directive @indirect(
      type: String
      scope: String = "PUBLIC"
      raw: Boolean = false
    ) on ARGUMENT_DEFINITION | FIELD_DEFINITION | INPUT_FIELD_DEFINITION

    type User {
      id: ID @indirect(type: "User")
      name: String
    }

    type UserIds {
      ids: [ID] @indirect(type: "User")
    }

    input SubInput {
      subId: ID @indirect(type: "User")
    }

    input UserInput {
      id: ID @indirect(type: "User")
      ids: [ID] @indirect(type: "User")
      sub: SubInput
      subs: [SubInput]
    }

    input UserWithSubsInput {
      subs: [SubInput]
      nonnullSubs: [SubInput!]
    }

    input CircularInput {
      id: ID @indirect(type: "User")
      circular: CircularInput
    }

    type Query {
      user(id: ID @indirect(type: "User"), input: UserInput): User
      users(
        ids: [ID] @indirect(type: "User")
        input: UserInput
        inputs: [UserInput]
      ): [User]
      userIds: UserIds
      userIdList: [ID] @indirect(type: "User")
      usersWithSub(input: UserWithSubsInput!): [User]
      userWithCircular(input: CircularInput): User
    }
  `;
  const resolvers = {
    Query: {
      user(root, { id, input }) {
        if (input) {
          id = input.id;
          if (input.sub) {
            id = input.sub.subId;
          }
        }
        return users.find((user) => user.id === id);
      },
      users(root, { ids, input, inputs }) {
        if (input) {
          ids = input.ids;
          if (input.subs) {
            ids = input.subs.map(({ subId }) => subId);
          }
          if (input.nonnullSubs) {
            ids = input.nonnullSubs.map(({ subId }) => subId);
          }
        }
        if (inputs) {
          ids = inputs.map(({ id }) => id);
        }
        if (ids) {
          return users.filter(({ id }) => ids.includes(id));
        }
        return users;
      },
      userIds() {
        return { ids: users.map(({ id }) => id) };
      },
      userIdList() {
        return users.map(({ id }) => id);
      },
      usersWithSub(...args) {
        return resolvers.Query.users(...args);
      },
      userWithCircular(root, { input }) {
        const findId = ({ id, circular }) => (circular ? findId(circular) : id);
        const id = findId(input);
        return users.find((user) => user.id === id);
      },
    },
  };

  let schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });
  schema = idorDirectiveTransformer("indirect", { salt: "secret" })(schema);

  const rootValue = null;
  const contextValue = {};

  test("response contains obfuscated IDs", async () => {
    const source = `
      query {
        users {
          id
        }
      }
    `;
    const variableValues = {};
    const received = await graphql({
      schema,
      source,
      rootValue,
      contextValue,
      variableValues,
    });
    const expected = {
      data: {
        users: [
          { id: "FLN1a5AnVsGFmVXQYabHxA" },
          { id: "Re35aLsjbtwWA0KdZMw5qg" },
        ],
      },
    };
    expect(received).toEqual(expected);
  });

  test("response contains list of obfuscated IDs", async () => {
    const source = `
      query {
        userIdList
      }
    `;
    const variableValues = {};
    const received = await graphql({
      schema,
      source,
      rootValue,
      contextValue,
      variableValues,
    });
    const expected = {
      data: {
        userIdList: ["FLN1a5AnVsGFmVXQYabHxA", "Re35aLsjbtwWA0KdZMw5qg"],
      },
    };
    expect(received).toEqual(expected);
  });

  test("response contains object with list of obfuscated IDs", async () => {
    const source = `
      query {
        userIds { ids }
      }
    `;
    const variableValues = {};
    const received = await graphql({
      schema,
      source,
      rootValue,
      contextValue,
      variableValues,
    });
    const expected = {
      data: {
        userIds: { ids: ["FLN1a5AnVsGFmVXQYabHxA", "Re35aLsjbtwWA0KdZMw5qg"] },
      },
    };
    expect(received).toEqual(expected);
  });

  test("arguments can contain an obfuscated ID", async () => {
    const source = `
      query($id: ID!) {
        user(id: $id) {
          id
          name
        }
      }
    `;
    const variableValues = { id: "FLN1a5AnVsGFmVXQYabHxA" };
    const received = await graphql({
      schema,
      source,
      rootValue,
      contextValue,
      variableValues,
    });
    const expected = {
      data: { user: { id: "FLN1a5AnVsGFmVXQYabHxA", name: "User 1" } },
    };
    expect(received).toEqual(expected);
  });

  test("arguments can contain an object with an obfuscated ID", async () => {
    const source = `
      query($input: UserInput) {
        user(input: $input) {
          id
          name
        }
      }
    `;
    const variableValues = { input: { id: "FLN1a5AnVsGFmVXQYabHxA" } };
    const received = await graphql({
      schema,
      source,
      rootValue,
      contextValue,
      variableValues,
    });
    const expected = {
      data: { user: { id: "FLN1a5AnVsGFmVXQYabHxA", name: "User 1" } },
    };
    expect(received).toEqual(expected);
  });

  test("arguments can contain a list of obfuscated IDs", async () => {
    const source = `
      query($ids: [ID]) {
        users(ids: $ids) {
          id
          name
        }
      }
    `;
    const variableValues = { ids: ["FLN1a5AnVsGFmVXQYabHxA"] };
    const received = await graphql({
      schema,
      source,
      rootValue,
      contextValue,
      variableValues,
    });
    const expected = {
      data: { users: [{ id: "FLN1a5AnVsGFmVXQYabHxA", name: "User 1" }] },
    };
    expect(received).toEqual(expected);
  });

  test("arguments can contain an object with a list of obfuscated IDs", async () => {
    const source = `
      query($input: UserInput) {
        users(input: $input) {
          id
          name
        }
      }
    `;
    const variableValues = { input: { ids: ["FLN1a5AnVsGFmVXQYabHxA"] } };
    const received = await graphql({
      schema,
      source,
      rootValue,
      contextValue,
      variableValues,
    });
    const expected = {
      data: { users: [{ id: "FLN1a5AnVsGFmVXQYabHxA", name: "User 1" }] },
    };
    expect(received).toEqual(expected);
  });

  test("arguments can contain a list of objects with obfuscated IDs", async () => {
    const source = `
      query($inputs: [UserInput]) {
        users(inputs: $inputs) {
          id
          name
        }
      }
    `;
    const variableValues = { inputs: [{ id: "FLN1a5AnVsGFmVXQYabHxA" }] };
    const received = await graphql({
      schema,
      source,
      rootValue,
      contextValue,
      variableValues,
    });
    const expected = {
      data: { users: [{ id: "FLN1a5AnVsGFmVXQYabHxA", name: "User 1" }] },
    };
    expect(received).toEqual(expected);
  });

  test("arguments can contain a nested object with an obfuscated ID", async () => {
    const source = `
        query($input: UserInput) {
          user(input: $input) {
            id
            name
          }
        }
      `;
    const variableValues = {
      input: { sub: { subId: "FLN1a5AnVsGFmVXQYabHxA" } },
    };
    const received = await graphql({
      schema,
      source,
      rootValue,
      contextValue,
      variableValues,
    });
    const expected = {
      data: { user: { id: "FLN1a5AnVsGFmVXQYabHxA", name: "User 1" } },
    };
    expect(received).toEqual(expected);
  });

  test("arguments can contain a nested list of objects with an obfuscated ID", async () => {
    const source = `
      query($input: UserWithSubsInput!) {
        usersWithSub(input: $input) {
          id
          name
        }
      }
    `;
    const variableValues = {
      input: { subs: [{ subId: "FLN1a5AnVsGFmVXQYabHxA" }] },
    };
    const received = await graphql({
      schema,
      source,
      rootValue,
      contextValue,
      variableValues,
    });
    const expected = {
      data: {
        usersWithSub: [{ id: "FLN1a5AnVsGFmVXQYabHxA", name: "User 1" }],
      },
    };
    expect(received).toEqual(expected);
  });

  test("arguments can contain a nested list of nonnull objects with an obfuscated ID", async () => {
    const source = `
      query($input: UserWithSubsInput!) {
        usersWithSub(input: $input) {
          id
          name
        }
      }
    `;
    const variableValues = {
      input: { nonnullSubs: [{ subId: "FLN1a5AnVsGFmVXQYabHxA" }] },
    };
    const received = await graphql({
      schema,
      source,
      rootValue,
      contextValue,
      variableValues,
    });
    const expected = {
      data: {
        usersWithSub: [{ id: "FLN1a5AnVsGFmVXQYabHxA", name: "User 1" }],
      },
    };
    expect(received).toEqual(expected);
  });

  test("arguments can contain circular nested objects", async () => {
    const source = `
      query($input: CircularInput) {
        userWithCircular(input: $input) {
          id
          name
        }
      }
    `;
    const variableValues = {
      input: {
        circular: { circular: { circular: { id: "FLN1a5AnVsGFmVXQYabHxA" } } },
      },
    };
    const received = await graphql({
      schema,
      source,
      rootValue,
      contextValue,
      variableValues,
    });
    const expected = {
      data: {
        userWithCircular: { id: "FLN1a5AnVsGFmVXQYabHxA", name: "User 1" },
      },
    };
    expect(received).toEqual(expected);
  });
});
