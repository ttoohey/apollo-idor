import { UserInputError } from "apollo-server";
import { getDirective, MapperKind, mapSchema } from "@graphql-tools/utils";
import {
  defaultFieldResolver,
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLScalarType,
} from "graphql";
import Idor from "idor";

function isGraphQLList(type) {
  if (type instanceof GraphQLNonNull) {
    return isGraphQLList(type.ofType);
  }
  return type instanceof GraphQLList;
}
function isGraphQLInputObjectType(type) {
  if (type instanceof GraphQLNonNull || type instanceof GraphQLList) {
    return isGraphQLInputObjectType(type.ofType);
  }
  return type instanceof GraphQLInputObjectType;
}

function isGraphQLScalarType(type) {
  if (type instanceof GraphQLNonNull || type instanceof GraphQLList) {
    return isGraphQLScalarType(type.ofType);
  }
  return type instanceof GraphQLScalarType;
}

function getGraphQLInputObjectTypeFields(type) {
  if (type instanceof GraphQLNonNull || type instanceof GraphQLList) {
    return getGraphQLInputObjectTypeFields(type.ofType);
  }
  return type._fields;
}

function idorDirectiveTransformer(directiveName, options) {
  return (schema) => {
    const idor = Idor(options);

    const scopeResolvers = {
      PUBLIC: () => null,
      CONTEXT: (context, name) => {
        if (!context[directiveName]) {
          throw new UserInputError(
            `"${name}" expects \`context.${directiveName}\` to be set`
          );
        }
        return context[directiveName];
      },
      ...options.scopeResolvers,
    };

    function resolveScope(context, name, directive) {
      const scopeType = directive.scope;
      const resolve = scopeResolvers[scopeType];
      if (!resolve) {
        throw new UserInputError(`${name} has an unknown scope type`);
      }
      return resolve(context, name, directive);
    }

    function getArgumentTransformers(list) {
      const argumentTransformers = new Map();
      for (const [name, config] of Object.entries(list)) {
        if (isGraphQLScalarType(config.type)) {
          const d = getDirective(schema, config, directiveName);
          if (d) {
            const directive = d[0];
            const objectType = config.type;
            const type = directive.type || objectType.name;
            argumentTransformers.set(name, (value, context) => {
              if (value === null || value === undefined) {
                return value;
              }
              const scope = resolveScope(
                context,
                `${objectType.name}.${name}`,
                directive
              );
              const transform = (value) => {
                const indirectValue = idor.fromString(value, scope);
                if (indirectValue.typename !== type) {
                  throw new UserInputError(
                    `Invalid value. Expected type "${type}" but found "${indirectValue.typename}"`
                  );
                }
                return indirectValue.valueOf();
              };
              if (Array.isArray(value)) {
                return value.map(transform);
              }
              return transform(value);
            });
          }
        } else if (isGraphQLInputObjectType(config.type)) {
          const fields = getGraphQLInputObjectTypeFields(config.type);
          if (isGraphQLList(config.type)) {
            argumentTransformers.set(name, (values, context) => {
              if (values === null || values === undefined) {
                return values;
              }
              const childTransformers = getArgumentTransformers(fields);
              const list = [];
              for (const value of values) {
                const result = {};
                for (const [fieldName, transform] of childTransformers) {
                  if (
                    value[fieldName] === null ||
                    value[fieldName] === undefined
                  ) {
                    continue;
                  }
                  result[fieldName] = transform(value[fieldName], context);
                }
                list.push({ ...value, ...result });
              }
              return list;
            });
          } else {
            argumentTransformers.set(name, (value, context) => {
              if (value === null || value === undefined) {
                return value;
              }
              const childTransformers = getArgumentTransformers(fields);
              const result = {};
              for (const [fieldName, transform] of childTransformers) {
                if (
                  value[fieldName] === null ||
                  value[fieldName] === undefined
                ) {
                  continue;
                }
                result[fieldName] = transform(value[fieldName], context);
              }
              return { ...value, ...result };
            });
          }
        }
      }
      return argumentTransformers;
    }

    function mapObjectFieldArguments(fieldConfig) {
      const { resolve, subscribe } = fieldConfig;
      const hasResolve = resolve instanceof Function;
      const hasSubscribe = subscribe instanceof Function;
      if (!hasResolve && !hasSubscribe) {
        return fieldConfig;
      }
      if (Object.keys(fieldConfig.args).length === 0) {
        return fieldConfig;
      }
      const argumentTransformers = getArgumentTransformers(fieldConfig.args);
      if (argumentTransformers.size > 0) {
        if (hasResolve) {
          fieldConfig.resolve = (root, originalArgs, context, ...rest) => {
            const args = Object.fromEntries(
              Object.entries(originalArgs).map(([fieldName, value]) => {
                if (!argumentTransformers.has(fieldName)) {
                  return [fieldName, value];
                }
                return [
                  fieldName,
                  argumentTransformers.get(fieldName)(value, context),
                ];
              })
            );
            return resolve(root, args, context, ...rest);
          };
        }
        if (hasSubscribe) {
          fieldConfig.subscribe = (root, originalArgs, context, ...rest) => {
            const args = Object.fromEntries(
              Object.entries(originalArgs).map(([fieldName, value]) => {
                if (!argumentTransformers.has(fieldName)) {
                  return [fieldName, value];
                }
                return [
                  fieldName,
                  argumentTransformers.get(fieldName)(value, context),
                ];
              })
            );
            return subscribe(root, args, context, ...rest);
          };
        }
      }
      return fieldConfig;
    }

    return mapSchema(schema, {
      [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
        const directive = getDirective(schema, fieldConfig, directiveName)?.[0];
        if (!directive) {
          return mapObjectFieldArguments(fieldConfig);
        }
        const objectType = fieldConfig.type;
        const fieldName = fieldConfig.name;
        const type = directive.type || objectType.name;
        const { resolve = defaultFieldResolver } = fieldConfig;
        const getIdorResolve = (_, context) => (value) => {
          if (value === null || value === undefined) {
            return value;
          }
          const scope = resolveScope(
            context,
            `${objectType.name}.${fieldName}`,
            directive
          );
          if (Array.isArray(value)) {
            return value.map((value) => idor.toString(value, type, scope));
          }
          return idor.toString(value, type, scope);
        };
        fieldConfig.resolve = (...args) => {
          const result = resolve(...args);
          const idorResolve = getIdorResolve(...args);
          if (Promise.resolve(result) === result) {
            return result.then(idorResolve);
          } else {
            return idorResolve(result);
          }
        };
        return mapObjectFieldArguments(fieldConfig);
      },
    });
  };
}

export default idorDirectiveTransformer;
