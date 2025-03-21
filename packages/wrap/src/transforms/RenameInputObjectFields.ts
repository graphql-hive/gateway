import {
  DelegationContext,
  SubschemaConfig,
  Transform,
} from '@graphql-tools/delegate';
import { ExecutionRequest, MapperKind, mapSchema } from '@graphql-tools/utils';
import {
  GraphQLInputFieldConfig,
  GraphQLSchema,
  ObjectFieldNode,
} from 'graphql';
import TransformInputObjectFields from './TransformInputObjectFields.js';

type RenamerFunction = (
  typeName: string,
  fieldName: string,
  inputFieldConfig: GraphQLInputFieldConfig,
) => string | undefined;

interface RenameInputObjectFieldsTransformationContext
  extends Record<string, any> {}

export default class RenameInputObjectFields<TContext = Record<string, any>>
  implements Transform<RenameInputObjectFieldsTransformationContext, TContext>
{
  private readonly renamer: RenamerFunction;
  private readonly transformer: TransformInputObjectFields<TContext>;
  private reverseMap: Record<string, Record<string, string>>;

  constructor(renamer: RenamerFunction) {
    this.renamer = renamer;
    this.transformer = new TransformInputObjectFields(
      (typeName, inputFieldName, inputFieldConfig) => {
        const newName = renamer(typeName, inputFieldName, inputFieldConfig);
        if (newName !== undefined && newName !== inputFieldName) {
          const value = renamer(typeName, inputFieldName, inputFieldConfig);
          if (value != null) {
            return [value, inputFieldConfig];
          }
        }
        return undefined;
      },
      (
        typeName: string,
        inputFieldName: string,
        inputFieldNode: ObjectFieldNode,
      ) => {
        if (!(typeName in this.reverseMap)) {
          return inputFieldNode;
        }

        const inputFieldNameMap = this.reverseMap[typeName];
        if (!(inputFieldName in inputFieldNameMap!)) {
          return inputFieldNode;
        }

        return {
          ...inputFieldNode,
          name: {
            ...inputFieldNode.name,
            value: inputFieldNameMap![inputFieldName]!,
          },
        };
      },
    );
    this.reverseMap = Object.create(null);
  }

  public transformSchema(
    originalWrappingSchema: GraphQLSchema,
    subschemaConfig: SubschemaConfig<any, any, any, TContext>,
  ): GraphQLSchema {
    mapSchema(originalWrappingSchema, {
      [MapperKind.INPUT_OBJECT_FIELD]: (
        inputFieldConfig: GraphQLInputFieldConfig,
        fieldName: string,
        typeName,
      ): undefined => {
        const newName = this.renamer(typeName, fieldName, inputFieldConfig);
        if (newName !== undefined && newName !== fieldName) {
          if (this.reverseMap[typeName] == null) {
            this.reverseMap[typeName] = Object.create(null);
          }
          this.reverseMap[typeName]![newName] = fieldName;
        }
        return undefined;
      },

      [MapperKind.ROOT_OBJECT]() {
        return undefined;
      },
    });

    return this.transformer.transformSchema(
      originalWrappingSchema,
      subschemaConfig,
    );
  }

  public transformRequest(
    originalRequest: ExecutionRequest,
    delegationContext: DelegationContext<TContext>,
    transformationContext: RenameInputObjectFieldsTransformationContext,
  ): ExecutionRequest {
    return this.transformer.transformRequest(
      originalRequest,
      delegationContext,
      transformationContext,
    );
  }
}
