import { Event as _Event, Block as _Block, DataHandlerContext, FieldSelection } from '@subsquid/substrate-processor';
import { Store } from '@subsquid/typeorm-store';

export const fieldSelection = {
  // these fields can be used in the future if needed
  // block: {
  //   timestamp: true,
  // },
  // call: {
  //   name: true,
  //   args: true,
  //   origin: true,
  //   success: true,
  //},
  // extrinsic: {
  //   hash: true,
  //   success: true,
  // },
  event: {
    name: true,
    args: true,
  },
} as FieldSelection;

type Fields = typeof fieldSelection;

export type Block = _Block<Fields>;
export type Event = _Event<Fields>;
export type ProcessorContext = DataHandlerContext<Store, Fields>;
