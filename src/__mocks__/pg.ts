import { parse } from "pg-connection-string";
import { mockPgClient } from "../../__tests__/helpers";

export const withClient = jest.fn(
  (connectionString, _parsedSettings, callback) => {
    const { database } = parse(connectionString);
    const mockContext = {
      database,
    };
    return callback(mockPgClient, mockContext);
  }
);
