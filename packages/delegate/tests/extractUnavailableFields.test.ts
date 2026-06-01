import { makeExecutableSchema } from '@graphql-tools/schema';
import { parseSelectionSet } from '@graphql-tools/utils';
import {
  FragmentDefinitionNode,
  getOperationAST,
  isObjectType,
  Kind,
  parse,
  print,
  SelectionSetNode,
} from 'graphql';
import { describe, expect, it } from 'vitest';
import {
  extractUnavailableFields,
  subtractSelectionSets,
} from '../src/extractUnavailableFields';

function stripWhitespaces(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}
describe('extractUnavailableFields', () => {
  it('should extract correct fields', () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          user: User
        }
        type User {
          id: ID!
          name: String!
        }
      `,
    });
    const userQuery = /* GraphQL */ `
      query {
        user {
          id
          name
          email
          friends {
            id
            name
            email
          }
        }
      }
    `;
    const userQueryDoc = parse(userQuery, { noLocation: true });
    const operationAst = getOperationAST(userQueryDoc, null);
    if (!operationAst) {
      throw new Error('Operation AST not found');
    }
    const selectionSet = operationAst.selectionSet;
    const userSelection = selectionSet.selections[0];
    if (userSelection?.kind !== 'Field') {
      throw new Error('User selection not found');
    }
    const queryType = schema.getType('Query');
    if (!isObjectType(queryType)) {
      throw new Error('Query type not found');
    }
    const userField = queryType.getFields()['user'];
    if (!userField) {
      throw new Error('User field not found');
    }
    const unavailableFields = extractUnavailableFields(
      schema,
      userField,
      userSelection,
      () => true,
    );
    const extractedSelectionSet: SelectionSetNode = {
      kind: Kind.SELECTION_SET,
      selections: unavailableFields,
    };
    expect(stripWhitespaces(print(extractedSelectionSet))).toBe(
      `{ email friends { id name email } }`,
    );
  });
  it('excludes __typename', () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          user: User
        }
        type User {
          id: ID!
          name: String!
          friends: [User]
        }
      `,
    });
    const userQuery = /* GraphQL */ `
      query {
        user {
          __typename
          id
          name
          friends {
            __typename
            id
            name
            description
          }
        }
      }
    `;
    const userQueryDoc = parse(userQuery, { noLocation: true });
    const operationAst = getOperationAST(userQueryDoc, null);
    if (!operationAst) {
      throw new Error('Operation AST not found');
    }
    const selectionSet = operationAst.selectionSet;
    const userSelection = selectionSet.selections[0];
    if (userSelection?.kind !== 'Field') {
      throw new Error('User selection not found');
    }
    const queryType = schema.getType('Query');
    if (!isObjectType(queryType)) {
      throw new Error('Query type not found');
    }
    const userField = queryType.getFields()['user'];
    if (!userField) {
      throw new Error('User field not found');
    }
    const unavailableFields = extractUnavailableFields(
      schema,
      userField,
      userSelection,
      () => true,
    );
    const extractedSelectionSet: SelectionSetNode = {
      kind: Kind.SELECTION_SET,
      selections: unavailableFields,
    };
    expect(stripWhitespaces(print(extractedSelectionSet))).toBe(
      '{ friends { description } }',
    );
  });
  it('picks the subfields only when available to resolve', () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          post: Post
        }
        type Post {
          id: ID!
        }
      `,
    });
    const fieldNodesByField: Record<string, any> = {
      Post: {
        id: [],
        name: [],
      },
      Category: {
        id: [],
        // details: undefined, // This field is not available to resolve
      },
    };
    const postQuery = /* GraphQL */ `
      query {
        post {
          id
          name
          category {
            id
            details
          }
        }
      }
    `;
    const postQueryDoc = parse(postQuery, { noLocation: true });
    const operationAst = getOperationAST(postQueryDoc, null);
    if (!operationAst) {
      throw new Error('Operation AST not found');
    }
    const selectionSet = operationAst.selectionSet;
    const postSelection = selectionSet.selections[0];
    if (postSelection?.kind !== 'Field') {
      throw new Error('Post selection not found');
    }
    const queryType = schema.getType('Query');
    if (!isObjectType(queryType)) {
      throw new Error('Query type not found');
    }
    const postField = queryType.getFields()['post'];
    if (!postField) {
      throw new Error('Post field not found');
    }
    const unavailableFields = extractUnavailableFields(
      schema,
      postField,
      postSelection,
      (fieldType, selection) =>
        !fieldNodesByField?.[fieldType.name]?.[selection.name.value],
    );
    const extractedSelectionSet: SelectionSetNode = {
      kind: Kind.SELECTION_SET,
      selections: unavailableFields,
    };
    expect(stripWhitespaces(print(extractedSelectionSet))).toBe(
      '{ category { id details } }',
    );
  });
  it('preserves inline fragment wrappers when the concrete type is missing from the subschema', () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        interface P {
          id: ID!
        }

        interface Account {
          id: ID!
        }

        type Relationship implements P {
          id: ID!
          acct: Account
        }

        type Query {
          relByAcct: Relationship
        }
      `,
    });
    const relationshipQuery = /* GraphQL */ `
      query {
        relByAcct {
          acct {
            ... on Card {
              billing
            }
          }
          id
        }
      }
    `;
    const relationshipQueryDoc = parse(relationshipQuery, { noLocation: true });
    const operationAst = getOperationAST(relationshipQueryDoc, null);
    if (!operationAst) {
      throw new Error('Operation AST not found');
    }
    const selectionSet = operationAst.selectionSet;
    const relationshipSelection = selectionSet.selections[0];
    if (relationshipSelection?.kind !== Kind.FIELD) {
      throw new Error('Relationship selection not found');
    }
    const queryType = schema.getType('Query');
    if (!isObjectType(queryType)) {
      throw new Error('Query type not found');
    }
    const relationshipField = queryType.getFields()['relByAcct'];
    if (!relationshipField) {
      throw new Error('Relationship field not found');
    }
    const unavailableFields = extractUnavailableFields(
      schema,
      relationshipField,
      relationshipSelection,
      () => true,
    );
    const extractedSelectionSet: SelectionSetNode = {
      kind: Kind.SELECTION_SET,
      selections: unavailableFields,
    };
    expect(stripWhitespaces(print(extractedSelectionSet))).toBe(
      '{ acct { ... on Card { billing } } }',
    );
  });
  it('preserves inline fragment wrappers from fragment spreads when the concrete type is missing from the subschema', () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        interface P {
          id: ID!
        }

        interface Account {
          id: ID!
        }

        type Relationship implements P {
          id: ID!
          acct: Account
        }

        type Query {
          relByAcct: Relationship
        }
      `,
    });
    const relationshipQuery = /* GraphQL */ `
      query {
        relByAcct {
          acct {
            ...CardFields
          }
          id
        }
      }

      fragment CardFields on Card {
        billing
      }
    `;
    const relationshipQueryDoc = parse(relationshipQuery, { noLocation: true });
    const operationAst = getOperationAST(relationshipQueryDoc, null);
    if (!operationAst) {
      throw new Error('Operation AST not found');
    }
    const selectionSet = operationAst.selectionSet;
    const relationshipSelection = selectionSet.selections[0];
    if (relationshipSelection?.kind !== 'Field') {
      throw new Error('Relationship selection not found');
    }
    const queryType = schema.getType('Query');
    if (!isObjectType(queryType)) {
      throw new Error('Query type not found');
    }
    const relationshipField = queryType.getFields()['relByAcct'];
    if (!relationshipField) {
      throw new Error('Relationship field not found');
    }
    const fragments = relationshipQueryDoc.definitions.reduce<
      Record<string, FragmentDefinitionNode>
    >((acc, definition) => {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        acc[definition.name.value] = definition;
      }
      return acc;
    }, {});
    const unavailableFields = extractUnavailableFields(
      schema,
      relationshipField,
      relationshipSelection,
      () => true,
      fragments,
    );
    const extractedSelectionSet: SelectionSetNode = {
      kind: Kind.SELECTION_SET,
      selections: unavailableFields,
    };
    expect(stripWhitespaces(print(extractedSelectionSet))).toBe(
      '{ acct { ... on Card { billing } } }',
    );
  });
  it('issue #6614', () => {
    const selectionSet1 = parseSelectionSet(
      /* GraphQL */ `
        {
          example {
            securitySystem {
              components {
                __typename
                id
                name
              }
            }
            notifications {
              settings {
                __typename
                id
                languageCode
              }
            }
          }
        }
      `,
      { noLocation: true },
    );
    const selectionSet2 = parseSelectionSet(
      /* GraphQL */ `
        {
          example {
            notifications {
              settings {
                __typename
                id
                languageCode
              }
            }
          }
        }
      `,
      { noLocation: true },
    );
    const result = subtractSelectionSets(selectionSet1, selectionSet2);
    expect(print(result)).toBe(
      /* GraphQL */ `
{
  example {
    securitySystem {
      components {
        __typename
        id
        name
      }
    }
  }
}
    `.trim(),
    );
  });
});
