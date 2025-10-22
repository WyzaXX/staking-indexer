import dotenv from 'dotenv';
import { Pool, type Client } from 'pg';
import express from 'express';
import { NodePlugin } from 'graphile-build';
import { gql, makeExtendSchemaPlugin, postgraphile, Plugin } from 'postgraphile';
import AggregatesPlugin from '@graphile/pg-aggregates';
import FilterPlugin from 'postgraphile-plugin-connection-filter';
import SimplifyInflectorPlugin from '@graphile-contrib/pg-simplify-inflector';

dotenv.config();

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'postgres',
};

const app = express();
const pool = new Pool(DB_CONFIG);

export const ProcessorStatusPlugin: Plugin = makeExtendSchemaPlugin((build, options) => {
  return {
    typeDefs: gql`
      type _ProcessorStatus {
        name: String!
        height: Int!
        hash: String!
      }

      extend type Query {
        _squidStatus: [_ProcessorStatus!]!
      }
    `,
    resolvers: {
      Query: {
        _squidStatus: async (parentObject, args, context, info) => {
          const pgClient: Client = context.pgClient;
          const { rows } = await pgClient.query(
            `SELECT 'staking-indexer' as name, height, hash FROM squid_processor.status`
          );
          return rows || [];
        },
      },
    },
  };
});

app.use(express.json());

app.get('/graphql', (req, res) => {
  res.redirect('/graphiql');
});

app.use(
  postgraphile(DB_CONFIG, 'public', {
    watchPg: true,
    retryOnInitFail: true,
    includeExtensionResources: true,
    graphiql: true,
    enhanceGraphiql: true,
    dynamicJson: true,
    disableDefaultMutations: true,
    skipPlugins: [NodePlugin],
    appendPlugins: [ProcessorStatusPlugin, AggregatesPlugin, FilterPlugin, SimplifyInflectorPlugin],
    disableQueryLog: false,
    enableQueryBatching: true,
    graphileBuildOptions: {
      connectionFilterRelations: true,
    },
  })
);

const PORT = process.env.GRAPHQL_SERVER_PORT || process.env.GQL_PORT || 4350;

app.listen(PORT, () => {
  console.log(`API started: GraphiQL: http://localhost:${PORT}/graphiql`);
});
