import {ASTNode, DocumentNode, Kind, visit} from "graphql/index";


export const sanitiseDocument = (doc: DocumentNode): DocumentNode => {
  const leave = (node: ASTNode): ASTNode => {
    return {
      ...node,
      kind: Kind.VARIABLE,
      name: {
        kind: Kind.NAME,
        value: "redacted"
      },
    }
  };
  return visit(doc, {
    StringValue: {
      leave,
    },
    BooleanValue: {
      leave,
    },
    FloatValue: {
      leave,
    },
    EnumValue: {
      leave,
    },
    IntValue: {
      leave,
    },
  });
};
