import { Request } from 'express';
import { IResolvers } from 'apollo-server-express';
import { Database, User } from '../../../lib/types';
import { authorize } from '../../../lib/utils';
import { UserArgs, UserBookingsArgs, UserBookingsData, UserListingsArgs, UserListingsData } from './types';

export const userResolvers: IResolvers = {
  Query: {
    user: async (_root: undefined, { id }: UserArgs, { db, req }: { db: Database; req: Request }): Promise<User> => {
      try {
        const user = await db.users.findOne({ _id: id });

        if (!user) {
          throw new Error("user can't be found");
        }

        const viewer = await authorize(db, req);

        if (viewer && viewer._id === user._id) {
          user.authorized = true;
        }

        return user;
      } catch (error) {
        throw new Error(`Failed to query user: ${error}`);
      }
    }
  },
  User: {
    id: (user: User): string => {
      return user._id;
    },
    hasWallet: (user: User): boolean => {
      return Boolean(user.walletId);
    },
    income: (user: User): number | null => {
      return user.authorized ? user.income : null;
    },
    bookings: async (
      user: User,
      { limit, page }: UserBookingsArgs,
      { db }: { db: Database }
    ): Promise<UserBookingsData | null> => {
      try {
        if (!user.authorized) {
          return null;
        }

        const data: UserBookingsData = {
          total: 0,
          result: []
        };

        let bookings = await db.bookings.find({
          _id: { $in: user.bookings }
        });

        bookings = bookings.skip(page > 0 ? (page - 1) * limit : 0);
        bookings = bookings.limit(limit);

        data.total = await bookings.count();
        data.result = await bookings.toArray();

        return data;
      } catch (error) {
        throw new Error(`Failed to query user bookings: ${error}`);
      }
    },
    listings: async (
      user: User,
      { limit, page }: UserListingsArgs,
      { db }: { db: Database }
    ): Promise<UserListingsData | null> => {
      try {
        const data: UserListingsData = {
          total: 0,
          result: []
        };

        let listings = await db.listings.find({
          _id: { $in: user.listings }
        });

        listings = listings.skip(page > 0 ? (page - 1) * limit : 0);
        listings = listings.limit(limit);

        data.total = await listings.count();
        data.result = await listings.toArray();

        return data;
      } catch (error) {
        throw new Error(`Failed to query user listings: ${error}`);
      }
    }
  }
};
