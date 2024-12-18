import {ASTNode, DocumentNode, Kind, visit} from "graphql/index";
import * as api from "@opentelemetry/api";
import {ExecutionResult} from "@graphql-tools/utils";


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


export const addTraceId = (context: api.Context, result: ExecutionResult): ExecutionResult => {
  return {
    ...result,
    extensions: {
      ...result.extensions,
      trace_id: api.trace.getSpan(context)?.spanContext().traceId,
    },
  };
};
